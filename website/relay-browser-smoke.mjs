// Real DDS and full-browser restart regression. Build the static site first.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTrainingPractice, applyPracticeBid, availablePracticeActions } from './dist/relay/practice.js';
import { applyBid } from './dist/relay/core.js';
import { AUCTION_FAMILIES, auctionFamilyForProfile } from './dist/relay/families.js';

const { chromium } = await import(process.env.BRIDGE_PLAYWRIGHT_MODULE || 'playwright');

const port = process.env.BRIDGE_RELAY_TEST_PORT || '3012';
const server = spawn(process.execPath, ['server.js', 'dist'], {
  cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: port }, stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
let persistent;
let browserProfile;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview server did not start')), 10000);
    server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview server exited: ${code}`)); });
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:${port}/relay.html`;
  const ready = () => page.waitForFunction(() => !document.getElementById('new-deal').disabled
    && document.querySelectorAll('#auction-family option').length === 8
    && document.querySelectorAll('#player-hand .suit-holding').length === 4
    && document.querySelector('#auction tr')
    && localStorage.getItem('bridge-lab.relay-progress.v1'));
  const auction = () => page.locator('#auction').innerHTML();
  const hand = () => page.locator('#player-hand').innerHTML();
  const clickBid = bid => page.locator(`#relay-actions [data-bid="${bid}"]`).click();
  const savedProgress = () => page.evaluate(() => JSON.parse(localStorage.getItem('bridge-lab.relay-progress.v1')));
  const studyProfile = async (profileId, role = 'asker') => {
    await page.selectOption('#auction-family', auctionFamilyForProfile(profileId).id);
    await ready();
    if (await page.locator('#practice-role').inputValue() !== role) {
      await page.selectOption('#practice-role', role);
      await ready();
    }
    if (!(await page.locator('#study-menu').evaluate(menu => menu.open))) await page.locator('#study-menu > summary').click();
    await page.selectOption('#profile', profileId);
    await ready();
    if (!(await page.locator('.replay-options').evaluate(menu => menu.open))) await page.locator('.replay-options > summary').click();
    await page.fill('#seed', 'relay-1');
    await page.click('#replay-deal');
    await ready();
    await page.locator('#study-menu > summary').click();
  };

  await page.goto(url);
  await ready();
  await page.waitForFunction(() => document.getElementById('dds-status').textContent === 'DDS ready');
  assert.equal(await page.locator('#contract-tools').isVisible(), true);
  assert.equal(await page.locator('#revealed-basis').evaluate(option => option.disabled), true);

  assert.equal(await page.locator('#auction-family option').count(), AUCTION_FAMILIES.length);
  assert.equal(await page.locator('#profile').isVisible(), false);
  assert.equal(await page.locator('#seed').isVisible(), false);
  for (const family of AUCTION_FAMILIES) {
    await page.selectOption('#auction-family', family.id);
    await ready();
    const first = await savedProgress();
    assert.ok(family.profileIds.includes(first.session.familyId));
    assert.equal(first.preferences.studyProfileId, '');
    assert.notEqual(first.session.seed, 'relay-1');
    await page.click('#new-deal');
    await ready();
    const second = await savedProgress();
    assert.ok(family.profileIds.includes(second.session.familyId));
    assert.notEqual(second.session.seed, first.session.seed);
    assert.equal(await page.locator('#profile').inputValue(), '');
    assert.equal(await page.locator('#seed').isVisible(), false);
    assert.equal((await page.locator('.practice-table').textContent()).includes(second.session.seed), false);
  }
  const familyHand = await hand();
  const familyAuction = await auction();
  await page.reload();
  await ready();
  assert.equal(await hand(), familyHand);
  assert.equal(await auction(), familyAuction);
  assert.equal(await page.locator('#auction-family').inputValue(), 'club-relays');
  assert.equal(await page.locator('#profile').inputValue(), '');
  assert.equal(await page.locator('#study-menu').evaluate(menu => menu.open), false);
  console.log('Browser family checks passed: broad selection, random branches/seeds, hidden study/replay controls and family-mode restoration.');

  for (const profileId of ['major-S', 'minor-d-h-c', 'dappleton-h-d-four-major']) {
    await studyProfile(profileId, 'teller');
    let practice = createTrainingPractice({ profileId, role: 'teller', seed: 'relay-1' });
    const originalHand = await hand();
    const originalAuction = await auction();
    assert.equal(await page.locator('#contract-tools').isVisible(), false);
    assert.equal(await page.locator('#partner-hand .card-backs').count(), 1);
    const humanSeat = practice.partnerSeat;
    assert.match(await page.locator('#player-seat').textContent(), new RegExp(`${humanSeat}.*Teller`));
    for (let turn = 0; !practice.finished && turn < 20; turn += 1) {
      const resolved = applyBid(practice, practice.pendingAsk.bid);
      const answer = resolved.auction.slice(practice.auction.length).find(call => call.seat === humanSeat).bid;
      if (turn === 0) {
        const wrong = availablePracticeActions(practice).find(action => action.bid !== answer);
        if (wrong) {
          await clickBid(wrong.bid);
          assert.match(await page.locator('#bid-feedback').textContent(), /does not match your hand/);
          assert.equal(await auction(), originalAuction);
          assert.equal(await hand(), originalHand);
        }
        await page.check('#show-hints');
        assert.ok(await page.locator('#relay-actions small').count() > 0);
        await page.uncheck('#show-hints');
      }
      await clickBid(answer);
      assert.equal(await hand(), originalHand);
      if (turn === 0) {
        await page.click('#undo-bid');
        assert.equal(await auction(), originalAuction);
        assert.equal(await hand(), originalHand);
        // Also exercise typed suit-symbol input.
        await page.fill('#bid-input', answer.replace('S', '♠').replace('H', '♥').replace('D', '♦').replace('C', '♣'));
        await page.click('#submit-bid');
        assert.equal(await page.locator('#bid-feedback').textContent(), '');
        const savedAuction = await auction();
        await page.reload();
        await ready();
        assert.match(await page.locator('#status').textContent(), /Restored your saved bidding progress/);
        assert.equal(await auction(), savedAuction);
        assert.equal(await hand(), originalHand);
        assert.equal(await page.locator('#practice-role').inputValue(), 'teller');
        assert.equal(await page.locator('#profile').inputValue(), profileId);
        assert.equal(await page.locator('#auction-family').inputValue(), auctionFamilyForProfile(profileId).id);
        assert.equal(await page.locator('#undo-bid').isDisabled(), false);
      }
      practice = applyPracticeBid(practice, answer);
    }
    assert.equal(practice.finished, true);
    assert.match(await page.locator('#status').textContent(), /Auction complete/);
    assert.equal(await page.locator('#partner-hand .card-backs').count(), 0);
  }
  console.log('Browser teller checks passed: major, minor, Dappleton, wrong answers, hints, typed bids, undo and completion.');

  await studyProfile('major-S');
  const originalHand = await hand();
  const originalAuction = await auction();
  await page.selectOption('#assessed-contract', '6S');
  await page.check('#show-hints');
  await page.selectOption('#sample-count', '500');
  await page.fill('#bid-input', '4♠');
  await page.reload();
  await ready();
  assert.equal(await hand(), originalHand);
  assert.equal(await page.locator('#assessed-contract').inputValue(), '6S');
  assert.equal(await page.locator('#show-hints').isChecked(), true);
  assert.equal(await page.locator('#sample-count').inputValue(), '500');
  assert.equal(await page.locator('#bid-input').inputValue(), '4♠');
  await page.uncheck('#show-hints');
  await page.selectOption('#sample-count', '100');
  await page.fill('#bid-input', '');
  await page.waitForFunction(() => document.getElementById('dds-status').textContent === 'DDS ready');
  await page.click('#evaluate');
  await page.waitForSelector('.contract-assessment', { timeout: 120000 });
  assert.match(await page.locator('.contract-assessment').textContent(), /Using auction information/);
  assert.match(await page.locator('.contract-assessment h3').textContent(), /needs 12 tricks/);
  assert.equal(await page.locator('#partner-hand .card-backs').count(), 1);
  assert.equal(await auction(), originalAuction);
  assert.equal(await hand(), originalHand);
  await page.locator('.paired-results summary').click();
  assert.ok(await page.locator('.paired-results tbody tr').count() >= 5);
  assert.doesNotMatch(await page.locator('#evaluation-results').textContent(), /NaN|undefined/);

  await page.click('#signoff-section summary');
  await page.locator('#signoff-actions [data-bid="5S"]').click();
  assert.equal(await page.locator('#assessed-contract').inputValue(), '5S');
  await page.selectOption('#analysis-basis', 'revealed');
  await page.click('#evaluate');
  await page.waitForSelector('.contract-assessment', { timeout: 120000 });
  assert.match(await page.locator('.contract-assessment').textContent(), /With the revealed partnership/);
  assert.match(await page.locator('#sample-status').textContent(), /100 random opponent layouts/);
  assert.equal(await page.locator('#sample-results').textContent(), '');
  // Reassessing an alternative after signoff must retain both chosen/assessed labels.
  await page.selectOption('#assessed-contract', '3NT');
  const completedAuction = await auction();
  await page.reload();
  await ready();
  assert.equal(await auction(), completedAuction);
  assert.equal(await page.locator('#analysis-basis').inputValue(), 'revealed');
  assert.equal(await page.locator('#assessed-contract').inputValue(), '3NT');
  assert.equal(await page.locator('#partner-hand .card-backs').count(), 0);
  await page.waitForFunction(() => document.getElementById('dds-status').textContent === 'DDS ready');
  await page.click('#evaluate');
  await page.waitForSelector('.contract-assessment', { timeout: 120000 });
  assert.match(await page.locator('.contract-assessment h3').textContent(), /needs 9 tricks/);
  assert.match(await page.locator('#evaluation-results').textContent(), /5♠ · chosen/);
  assert.equal(await page.locator('#assessed-contract option[value="5S"]').count(), 1);
  await page.click('#undo-bid');
  assert.equal(await auction(), originalAuction);
  assert.equal(await hand(), originalHand);
  assert.equal(await page.locator('#analysis-basis').inputValue(), 'auction');
  assert.equal(await page.locator('#revealed-basis').evaluate(option => option.disabled), true);

  await page.selectOption('#sample-count', '1000');
  await page.click('#evaluate');
  await page.click('#stop-analysis');
  await ready();
  await page.waitForFunction(() => document.getElementById('dds-status').textContent === 'DDS ready');
  assert.match(await page.locator('#status').textContent(), /Stopped/);
  assert.equal(await hand(), originalHand);
  assert.equal(await auction(), originalAuction);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('Browser asker checks passed: real DDS, assessment before signoff, paired outcomes, revealed-partnership review, alternate assessment, undo, Stop and mobile layout.');

  const unavailable = await browser.newPage();
  await unavailable.route('**/engine/bridge_engine.js', route => route.abort());
  await unavailable.goto(url);
  await unavailable.waitForFunction(() => document.getElementById('dds-status').textContent.includes('unavailable'));
  assert.equal(await unavailable.locator('#evaluate').isDisabled(), true);
  assert.equal(await unavailable.locator('#evaluation-results').textContent(), '');
  console.log('Browser missing-DDS check passed: evaluation disabled without placeholder results.');

  // Reopen Chromium itself with the same browser profile, not just the page.
  browserProfile = await mkdtemp(path.join(tmpdir(), 'bridge-relay-progress-'));
  persistent = await chromium.launchPersistentContext(browserProfile, { headless: true });
  let returning = persistent.pages()[0];
  await returning.goto(url);
  await returning.waitForFunction(() => !document.getElementById('new-deal').disabled);
  await returning.locator('#relay-actions [data-bid="2NT"]').click();
  const closedAuction = await returning.locator('#auction').innerHTML();
  const closedHand = await returning.locator('#player-hand').innerHTML();
  await persistent.close();
  persistent = await chromium.launchPersistentContext(browserProfile, { headless: true });
  returning = persistent.pages()[0];
  await returning.goto(url);
  await returning.waitForFunction(() => !document.getElementById('new-deal').disabled);
  assert.match(await returning.locator('#status').textContent(), /Restored your saved bidding progress/);
  assert.equal(await returning.locator('#auction').innerHTML(), closedAuction);
  assert.equal(await returning.locator('#player-hand').innerHTML(), closedHand);
  await returning.click('#undo-bid');
  assert.equal(await returning.locator('#auction .bid').count(), 1);
  await returning.reload();
  await returning.waitForFunction(() => !document.getElementById('new-deal').disabled);
  assert.equal(await returning.locator('#auction .bid').count(), 1, 'Undo was saved too');
  await returning.evaluate(() => localStorage.setItem('bridge-lab.relay-progress.v1', '{broken'));
  await returning.reload();
  await returning.waitForFunction(() => !document.getElementById('new-deal').disabled);
  assert.match(await returning.locator('#status').textContent(), /could not be restored/);
  assert.equal(await returning.locator('#auction .bid').count(), 1);
  console.log('Browser persistence checks passed: reload both roles, preferences, completed auction, undo, full browser restart and corrupt-save recovery.');
} finally {
  await persistent?.close();
  if (browserProfile) await rm(browserProfile, { recursive: true, force: true });
  await browser?.close();
  server.kill();
}
