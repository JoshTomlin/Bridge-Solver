import assert from 'node:assert/strict';
import test from 'node:test';
import { createPractice, applyBid, revealPractice, PRACTICE_PROFILES, availableActions, handFeatures } from './core.js';
import { createTrainingPractice, availablePracticeActions, applyPracticeBid, practiceCalls, practiceView, advanceAsker } from './practice.js';
import { applyPostRangeBid, keycardAction } from './continuations.js';
import { tableView } from './seat-view.js';
import { auctionCallDetails } from './auction-study.js';
import { savePracticeProgress, loadPracticeProgress } from './progress.js';

test('role changes which fixed hand is visible, including Dappleton’s reversed seats', () => {
  for (const profileId of ['major-S', 'minor-d-h-c', 'dappleton-h-d-four-major']) {
    const options = { profileId, seed: 'same-role-deal' };
    const original = createPractice(options);
    const asker = createTrainingPractice(options);
    const teller = createTrainingPractice({ ...options, role: 'teller' });
    assert.deepEqual(asker.playerHand, original.playerHand);
    assert.deepEqual(teller.playerHand, original.playerHand);
    assert.deepEqual(teller.partnerHand, original.partnerHand);
    assert.deepEqual(practiceView(teller).playerHand, original.partnerHand);
    assert.deepEqual(practiceView(teller).partnerHand, original.playerHand);
    assert.equal(practiceView(teller).playerSeat, original.partnerSeat);
    assert.equal(practiceView(teller).partnerSeat, original.playerSeat);
    assert.equal(practiceView(asker).playerSeat, original.playerSeat);
    assert.equal(teller.revealed, false);
    assert.equal(Object.isFrozen(teller), true);
  }
  assert.throws(() => createTrainingPractice({ role: 'other' }), /asker or teller/);
});

test('asker practice retains the original source interpreter and final-contract choice', () => {
  const initial = createTrainingPractice({ seed: 'asker-control' });
  const next = applyPracticeBid(initial, '2NT');
  assert.deepEqual(next, applyBid(initial, '2NT'));
  assert.equal(practiceView(next).auction.length, 3);
  const final = applyPracticeBid(next, '6S');
  assert.equal(final.contract.bid, '6S');
  assert.equal(final.contract.declarer, 'North');
  assert.equal(final.finished, true);
});

test('teller accepts the screenshot 14-count as the first balanced Jacoby range step', () => {
  const initial = createTrainingPractice({ major: 'H', role: 'teller', seed: 'balanced-teller' });
  const fixed = {
    ...initial,
    partnerHand: 'SK ST S6 S5 HA HQ HJ H4 H2 DK D5 CJ C4'.split(' '),
    playerHand: 'SA SQ SJ S9 HK HT H9 H8 DA DQ D8 C9 C8'.split(' '),
  };
  const shape = applyPracticeBid(fixed, '3C');
  assert.equal(shape.pendingAsk.bid, '3D');
  assert.deepEqual(availablePracticeActions(shape).map(({ bid, label }) => [bid, label]), [
    ['3H', '12–14 HCP'], ['3S', '15–17 HCP'], ['3NT', '18–19 HCP'],
  ]);
  const before = JSON.stringify(shape);
  assert.throws(() => applyPracticeBid(shape, '3S'), /does not match your hand/);
  assert.equal(JSON.stringify(shape), before);
  const ranged = applyPracticeBid(shape, '3H');
  assert.equal(ranged.auction.at(-1).meaning, '12–14 HCP');
  assert.equal(ranged.pendingAsk.bid, '3S');
  assert.deepEqual(ranged.partnerHand, fixed.partnerHand);
});

test('Jacoby uses 4M for keycards after a void and refreshes a saved pending ask', () => {
  const cases = [
    {
      major: 'S',
      partner: 'SA SJ S9 S6 S5 DA DQ D9 D3 CJ C6 C5 C3',
      player: 'SK SQ ST S8 HA HK H9 DK D7 C8 C7 C4 C2',
      openerCalls: ['3H', '4C', '4H'],
      expectedAuction: ['1S', '2NT', '3H', '3S', '4C', '4D', '4H', '4S'],
      replies: ['4NT', '5C', '5D', '5H'], answer: '5D', oldAsk: '4NT',
    },
    {
      major: 'H',
      partner: 'SA SQ S9 S3 HA HJ H9 H6 H5 CJ C6 C5 C3',
      player: 'SK S7 S4 HK HQ HT H8 DA DK D7 C8 C7 C2',
      openerCalls: ['3D', '3NT', '4D'],
      expectedAuction: ['1H', '2NT', '3D', '3H', '3NT', '4C', '4D', '4H'],
      replies: ['4S', '4NT', '5C', '5D'], answer: '5C', oldAsk: '4S',
    },
  ];
  for (const { major, partner, player, openerCalls, expectedAuction, replies, answer, oldAsk } of cases) {
    const initial = {
      ...createTrainingPractice({ profileId: `major-${major}`, role: 'teller', seed: 'jacoby-void-forcing' }),
      partnerHand: partner.split(' '), playerHand: player.split(' '),
    };
    const voidShown = openerCalls.reduce(applyPracticeBid, initial);
    assert.deepEqual(practiceView(voidShown).auction.map(call => call.bid), expectedAuction);
    assert.equal(availableActions(voidShown).find(call => call.bid === `4${major}`).askType, 'keycard');
    assert.deepEqual(practiceCalls(voidShown).map(call => call.bid), replies);
    assert.throws(() => applyPracticeBid(voidShown, 'Pass'), /is forcing/);
    assert.throws(() => applyPracticeBid(voidShown, '5NT'), /not an available response/);

    const oldAction = keycardAction(voidShown, oldAsk, major, 'normal');
    const legacy = { ...voidShown, pendingAsk: { ...voidShown.pendingAsk, bid: oldAsk, responseLadder: oldAction.responseLadder } };
    const storage = { data: null, setItem(key, value) { this.data = value; }, getItem() { return this.data; } };
    const answered = applyPracticeBid(voidShown, answer);
    assert.equal(answered.auction[8].bid, answer);
    savePracticeProgress({ session: legacy, history: [initial] }, storage);
    assert.deepEqual(loadPracticeProgress(storage).progress.session, JSON.parse(JSON.stringify(voidShown)));
    const legacyAnswered = advanceAsker(applyPostRangeBid({ ...legacy, pendingAsk: null }, oldAsk, oldAction));
    assert.equal(legacyAnswered.auction[7].bid, oldAsk);
    savePracticeProgress({ session: legacyAnswered, history: [initial, legacy] }, storage);
    const restored = loadPracticeProgress(storage).progress;
    assert.deepEqual(restored.session.auction, JSON.parse(JSON.stringify(legacyAnswered.auction)));
    assert.deepEqual(restored.history[1], JSON.parse(JSON.stringify(voidShown)));
  }
});

test('Baron minor agreement hands the shortage enquiry to opener while the human stays South with the same cards', () => {
  const south = 'SK HQ H8 DA DK D9 D5 CQ CT C7 C4 C3 C2'.split(' ');
  const cases = [
    ['1nt', 'SA S9 S2 HK H3 H2 DQ DJ D8 D3 CK CJ C8', '3C', '3D', '3H'],
    ['2c', 'SA SQ S2 HK H3 H2 DQ DJ D8 D3 CA CK C8', '3C', '3D', '3H'],
    ['1nt', 'SA S9 S2 HK H3 H2 DQ DJ D8 CK CJ C8 C5', '2NT', '3C', '3D'],
    ['2c', 'SA SQ S2 HK H3 H2 DQ DJ D8 CA CK C8 C5', '2NT', '3C', '3D'],
  ];
  for (const [rebid, north, answer, agreement, shortageAsk] of cases) {
    const initial = { ...createTrainingPractice({ profileId: `club-1s-${rebid}-baron`, seed: 'baron-handover' }),
      partnerHand: north.split(' '), playerHand: south };
    assert.equal(new Set([...initial.partnerHand, ...south]).size, 26);
    const before = applyPracticeBid(initial, '2S');
    assert.equal(before.auction.at(-1).bid, answer);
    const session = applyPracticeBid(before, agreement);
    assert.equal(session.practiceRole, 'teller');
    assert.equal(session.pendingAsk.bid, shortageAsk);
    assert.equal(tableView(session).playerSeat, 'South');
    assert.deepEqual(tableView(session).playerHand, south);
    assert.deepEqual(tableView(session).partnerHand, initial.partnerHand);
    assert.deepEqual(session.pendingAsk.responseLadder.map(response => response.label), ['High shortage: spades', 'Low shortage: hearts']);
    const shown = applyPracticeBid(session, session.pendingAsk.responseLadder[0].bid);
    assert.equal(shown.shortageSuit, 'S');
    assert.deepEqual(tableView(shown).playerHand, south);
    const historical = auctionCallDetails(shown, [initial, before, session], 3);
    assert.equal(historical.question.bid, '2S');
    assert.equal(historical.playedBid, answer);
    assert.ok(historical.alternatives.some(option => option.bid === answer));
    const storage = { data: null, setItem(key, value) { this.data = value; }, getItem() { return this.data; } };
    savePracticeProgress({ session: shown, history: [initial, before, session] }, storage);
    const restored = loadPracticeProgress(storage);
    assert.equal(restored.error, undefined);
    assert.deepEqual(tableView(restored.progress.session), JSON.parse(JSON.stringify(tableView(shown))));
    assert.deepEqual(tableView(applyPracticeBid(before, agreement)).playerHand, south, 'Undo replays with the original physical hand');
  }
});

test('wrong teller responses leave the question, cards, auction and facts unchanged', () => {
  const initial = createTrainingPractice({ seed: 'wrong-answer', role: 'teller' });
  const before = JSON.stringify(initial);
  const resolved = applyBid(initial, initial.pendingAsk.bid);
  const answer = resolved.auction.at(-1).bid;
  const wrong = availablePracticeActions(initial).find(action => action.bid !== answer);
  assert.ok(wrong);
  assert.throws(() => applyPracticeBid(initial, wrong.bid), /does not match your hand/);
  assert.throws(() => applyPracticeBid(initial, '1C'), /not an available response/);
  assert.equal(JSON.stringify(initial), before);
  assert.equal(initial.auction.length, 1, 'No answer is committed before the human responds');
  assert.equal(practiceView(initial).auction.at(-1).bid, '2NT');
  const accepted = applyPracticeBid(initial, answer);
  assert.deepEqual(accepted.auction, resolved.auction);
  assert.deepEqual(accepted.constraints, resolved.constraints);
  assert.deepEqual(accepted.partnerHand, initial.partnerHand);
  assert.equal(accepted.revealed, false);
  assert.equal(initial.pendingAsk.bid, '2NT', 'The old state remains a usable undo snapshot');
});

test('questions and offered responses do not read the hidden teller hand', () => {
  for (const profileId of ['major-H', 'minor-d-h-c', 'dappleton-h-d-four-major', 'rebid-single-d-h']) {
    let session = createTrainingPractice({ profileId, role: 'teller', seed: 'public-prompts' });
    while (!session.finished) {
      const { pendingAsk, ...base } = session;
      const hidden = { ...base, partnerHand: ['hidden'] };
      const prompt = advanceAsker(hidden);
      assert.deepEqual(prompt.pendingAsk, pendingAsk, profileId);
      assert.deepEqual(availablePracticeActions(prompt), availablePracticeActions(session), profileId);
      const answered = applyBid(session, pendingAsk.bid);
      const response = answered.auction.slice(session.auction.length).find(call => call.seat === session.partnerSeat);
      session = applyPracticeBid(session, response.bid);
    }
  }
});

test('all 63 exercises support teller answers through source questions and terminal Pass', () => {
  let answers = 0;
  let finalPasses = 0;
  let sourcePasses = 0;
  for (const profile of PRACTICE_PROFILES) for (const seed of ['role-a', 'role-b']) {
    let session = createTrainingPractice({ profileId: profile.id, seed, role: 'teller' });
    const original = practiceView(session);
    for (let turn = 0; !session.finished && turn < 20; turn += 1) {
      const view = practiceView(session);
      assert.equal(view.playerSeat, original.playerSeat, profile.id);
      assert.deepEqual(view.playerHand, original.playerHand);
      assert.deepEqual(view.partnerHand, original.partnerHand);
      if (view.role === 'asker') {
        const coached = advanceAsker(session);
        const bid = coached.auction[session.auction.length]?.bid ?? coached.pendingAsk?.bid;
        assert.ok(bid, profile.id);
        session = applyPracticeBid(session, bid);
        continue;
      }
      const pending = session.pendingAsk;
      assert.ok(pending, profile.id);
      const action = availableActions(session).find(action => action.bid === pending.bid);
      if (action?.askType === 'suit' || pending.kind === 'signoff' && pending.bid.startsWith('7')) {
        // The actual fixed hand is an independent test oracle. Production
        // selection is allowed only the asker's own hand and public answers.
        const own = handFeatures(session.playerHand, session.trump);
        const partner = handFeatures(session.partnerHand, session.trump);
        assert.equal(own.keycards + partner.keycards, 5, `${profile.id}: no grand try with a missing keycard`);
        assert.ok(own.trumpQueen || partner.trumpQueen, `${profile.id}: no grand try without the queen`);
      }
      const expected = applyBid(session, pending.bid);
      const answer = expected.auction.slice(session.auction.length).find(call => call.seat === session.partnerSeat);
      assert.ok(answer, profile.id);
      assert.ok(availablePracticeActions(session).some(action => action.bid === answer.bid), `${profile.id}: ${answer.bid}`);
      if (answer.bid === 'Pass') {
        if (pending.kind === 'signoff') finalPasses += 1;
        else sourcePasses += 1;
      }
      session = applyPracticeBid(session, answer.bid);
      answers += 1;
    }
    assert.equal(session.finished, true, profile.id);
    assert.ok(session.contract || session.unsupportedReason, profile.id);
    assert.deepEqual(availablePracticeActions(session), []);
    const revealed = revealPractice(session);
    assert.equal(revealed.revealed, true);
    assert.deepEqual(practiceView(revealed).playerHand, original.playerHand);
    assert.deepEqual(practiceView(revealed).partnerHand, original.partnerHand);
    assert.deepEqual(availablePracticeActions(revealed), []);
  }
  assert.ok(answers > 200);
  assert.ok(finalPasses > 0);
  assert.ok(sourcePasses > 0);
});
