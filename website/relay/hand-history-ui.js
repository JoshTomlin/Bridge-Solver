import { SUITS, RANKS } from './core.js';
import { auctionRounds } from './table-ui.js';
import { HAND_HISTORY_LIMIT, createHandRecord, loadHandHistory, updateHandHistory, saveHandHistory,
  recordedCallDetails, recordedHandStatus, canReviewBothHands, handRecordText } from './hand-history.js';

const byId = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const bidLabel = value => String(value).replace(/([1-7])(NT|[SHDC])/g, (_, level, suit) => level + ({ S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' })[suit]);
const dateLabel = date => new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function setupHandHistory({ getCurrentId, showCall }) {
  let loaded = loadHandHistory();
  let records = loaded.records;
  let selectedId = null;
  let lastSession = null;
  let lastId = null;
  let saveError = loaded.error;

  function renderList() {
    byId('open-current-hand-record').disabled = !records.some(record => record.id === getCurrentId());
    byId('hand-history-storage').textContent = saveError
      ? 'Hand history could not be saved in this browser. Copy any hands you want to keep before closing this tab.'
      : loaded.warning ?? `The most recent ${HAND_HISTORY_LIMIT} hands are saved in this browser. Clearing site data removes them.`;
    byId('hand-history-storage').classList.toggle('is-error', Boolean(saveError));
    byId('hand-history-empty').hidden = records.length > 0;
    byId('hand-history-list').innerHTML = records.map(record => `<li><button type="button" class="saved-hand" data-hand-id="${escapeHtml(record.id)}"><strong>${escapeHtml(bidLabel(record.title))}</strong><span>${escapeHtml(recordedHandStatus(record))}${record.id === getCurrentId() ? ' · Current hand' : ''}</span><small>${escapeHtml(dateLabel(record.createdAt))} · ${escapeHtml(record.role)}</small></button></li>`).join('');
  }

  function renderReview() {
    const record = records.find(record => record.id === selectedId);
    if (!record) return;
    const both = canReviewBothHands(record, getCurrentId());
    byId('saved-hand-title').textContent = bidLabel(record.title);
    byId('saved-hand-meta').textContent = `${dateLabel(record.createdAt)} · ${record.role} · ${recordedHandStatus(record)}`;
    byId('saved-hand-note').textContent = both ? 'Read-only review. Tap a call for its saved meaning and response steps.'
      : 'Read-only review. Partner’s cards stay hidden until you reveal this hand or move on to another hand.';
    byId('saved-hand-cards').innerHTML = ['North', 'South'].map(seat => `<section><h3>${seat} · ${seat === record.humanSeat ? 'You' : 'Partner'}</h3>${both || seat === record.humanSeat
      ? `<div class="record-hand">${SUITS.map(suit => `<span class="suit-holding suit-${suit}"><span class="symbol">${({ S: '♠', H: '♥', D: '♦', C: '♣' })[suit]}</span>${RANKS.filter(rank => record.hands[seat].includes(suit + rank)).join('') || '—'}</span>`).join('')}</div>`
      : '<p class="muted">Hidden while you are bidding this hand.</p>'}</section>`).join('');
    byId('saved-hand-auction').innerHTML = auctionRounds(record.auction, record.finished || record.revealed, record.dealerSeat ?? record.humanSeat, Boolean(record.competitive)).map(row => `<tr>${row.map(call => `<td>${!call ? '' : call.kind === 'pending' ? '<span class="awaiting-bid">?</span>'
      : call.kind === 'opponent' ? '<span class="opponent-pass">Pass</span>'
      : `<button type="button" class="bid auction-call" data-recorded-call="${call.index}" aria-label="${escapeHtml(bidLabel(call.bid))}, ${call.seat}. Show saved meaning and alternatives">${escapeHtml(bidLabel(call.bid))}</button>`}</td>`).join('')}</tr>`).join('');
    byId('saved-hand-text').value = handRecordText(record, getCurrentId());
    byId('saved-hand-seed').textContent = `Hand seed: ${record.seed}`;
    byId('saved-hand-share-status').textContent = '';
    byId('saved-hand-plain-text').open = false;
  }

  async function copyText() {
    const area = byId('saved-hand-text');
    try {
      await navigator.clipboard.writeText(area.value);
      byId('saved-hand-share-status').textContent = 'Copied. Paste into a message to your partner.';
    } catch {
      byId('saved-hand-plain-text').open = true;
      area.focus();
      area.select();
      byId('saved-hand-share-status').textContent = 'Select and copy the text below to send it to your partner.';
    }
  }

  byId('open-hand-history').addEventListener('click', () => {
    byId('settings-dialog').close();
    renderList();
  });
  byId('open-current-hand-record').addEventListener('click', () => {
    selectedId = getCurrentId();
    renderReview();
  });
  byId('hand-history-list').addEventListener('click', event => {
    const button = event.target.closest('[data-hand-id]');
    if (!button) return;
    selectedId = button.dataset.handId;
    renderReview();
    byId('saved-hand-dialog').showModal();
  });
  byId('saved-hand-auction').addEventListener('click', event => {
    const button = event.target.closest('[data-recorded-call]');
    const record = records.find(record => record.id === selectedId);
    if (button && record) showCall(recordedCallDetails(record, Number(button.dataset.recordedCall)));
  });
  byId('copy-saved-hand').addEventListener('click', copyText);
  byId('share-saved-hand').addEventListener('click', async () => {
    if (!navigator.share) { await copyText(); return; }
    try {
      await navigator.share({ title: `Bridge Lab · ${byId('saved-hand-title').textContent}`, text: byId('saved-hand-text').value });
      byId('saved-hand-share-status').textContent = 'Shared.';
    } catch (error) {
      if (error.name === 'AbortError') byId('saved-hand-share-status').textContent = 'Share cancelled.';
      else await copyText();
    }
  });

  renderList();
  return {
    completedHands() {
      return [...loadHandHistory().records, ...records].filter(record => record.finished);
    },
    save(session, history, id) {
      // UI preferences also autosave; only record changes to bidding state.
      if (session === lastSession && id === lastId && !saveError) return;
      try {
        loaded = loadHandHistory();
        // Keep hands saved by another tab, and retry any snapshots that were
        // retained in memory during a temporary storage failure.
        const combined = new Map(loaded.records.map(record => [record.id, record]));
        for (const record of records) {
          if (!combined.has(record.id) || record.updatedAt > combined.get(record.id).updatedAt) combined.set(record.id, record);
        }
        records = [...combined.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const previous = records.find(record => record.id === id);
        const record = createHandRecord(session, history, { id, createdAt: previous?.createdAt });
        records = updateHandHistory(records, record);
        const saved = loaded.error ? { ok: false, error: loaded.error } : saveHandHistory(records);
        saveError = saved.ok ? null : saved.error;
        lastSession = session;
        lastId = id;
      } catch (error) {
        saveError = error.message || String(error);
      }
      byId('hand-history-save-status').textContent = saveError ? 'Hand history is not being saved. Open Hand history for details.' : '';
      renderList();
      if (byId('saved-hand-dialog').open) renderReview();
    },
  };
}
