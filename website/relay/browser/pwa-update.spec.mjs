import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { copyFileSync, mkdirSync, readFileSync, mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildWebsite, staticFiles } from '../../build.js';
import { clickBid } from './helpers.mjs';

const basePath = '/Bridge-Solver/';
const contentTypes = { '.js':'text/javascript', '.html':'text/html', '.css':'text/css',
  '.wasm':'application/wasm', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml' };

async function hostReleases() {
  const tmp = mkdtempSync(join(tmpdir(),'bridge-update-'));
  const sourceRoot = join(tmp,'source');
  for (const file of staticFiles) {
    const target = join(sourceRoot,file);
    mkdirSync(dirname(target),{recursive:true});
    copyFileSync(fileURLToPath(new URL(`../../${file}`,import.meta.url)),target);
  }
  const oldRelease = buildWebsite({sourceRoot,destination:join(tmp,'old')});
  appendFileSync(join(sourceRoot,'styles.css'),'\n/* Second release for update testing. */\n');
  const newRelease = buildWebsite({sourceRoot,destination:join(tmp,'new')});
  let active = oldRelease;
  let broken = false;
  const server = createServer((request,response)=>{
    const name = new URL(request.url,'http://localhost').pathname.slice(basePath.length) || 'index.html';
    try {
      if (broken && name === `${active.assetPrefix}/relay/diamond-raise.js`) {
        response.writeHead(503).end();
        return;
      }
      const content = readFileSync(join(active.destination,name));
      response.writeHead(200,{'Content-Type':contentTypes[extname(name)] ?? 'application/octet-stream'});
      response.end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {
    oldRelease, newRelease, url:`http://127.0.0.1:${server.address().port}${basePath}relay.html`,
    publish({incomplete=false}={}) { active = newRelease; broken = incomplete; },
    close() { server.close(); rmSync(tmp,{recursive:true,force:true}); },
  };
}

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('bridge-lab.relay-progress.v1')));
const installedVersion = page => page.locator('meta[name="relay-build"]').getAttribute('content');

test('a manual update retries a failed download, keeps other tabs open, and restores the auction', async ({ page, context }) => {
  test.setTimeout(90000);
  const releases = await hostReleases();
  try {
    await page.goto(releases.url);
    await expect(page.locator('#new-deal')).toBeEnabled();
    await expect(page.locator('#offline-status')).toHaveText('Ready for offline practice.');
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await clickBid(page,'2NT');
    const before = await saved(page);
    const otherTab = await context.newPage();
    await otherTab.goto(releases.url);
    await expect(otherTab.locator('#new-deal')).toBeEnabled();
    expect(await installedVersion(otherTab)).toBe(releases.oldRelease.version);

    await page.click('#settings-open');
    await page.locator('#install-menu > summary').click();
    const update = page.locator('#update-app');
    const status = page.locator('#update-status');
    await update.click();
    await expect(status).toHaveText('Bridge Lab is up to date.');

    releases.publish({incomplete:true});
    await update.click();
    await expect(status).toHaveText('Could not update. Try again in a moment.');
    expect(await installedVersion(page)).toBe(releases.oldRelease.version);
    expect(await saved(page)).toEqual(before);

    releases.publish();
    await update.click();
    await expect(update).toHaveText('Restart to update');
    expect(await installedVersion(page)).toBe(releases.oldRelease.version);

    await page.evaluate(() => {
      const setItem = Storage.prototype.setItem;
      window.restoreSetItem = () => { Storage.prototype.setItem = setItem; };
      Storage.prototype.setItem = function (key, value) {
        if (key === 'bridge-lab.relay-progress.v1') throw new DOMException('Storage denied','QuotaExceededError');
        return setItem.call(this,key,value);
      };
    });
    await update.click();
    await expect(status).toContainText('Your auction could not be saved');
    expect(await installedVersion(page)).toBe(releases.oldRelease.version);
    expect(await saved(page)).toEqual(before);
    await page.evaluate(() => window.restoreSetItem());

    await update.click();
    await expect.poll(() => installedVersion(page)).toBe(releases.newRelease.version);
    expect(await installedVersion(otherTab)).toBe(releases.oldRelease.version);
    await expect(page.locator('#new-deal')).toBeEnabled();
    expect(await saved(page)).toEqual(before);

    await context.setOffline(true);
    expect(await otherTab.evaluate(async asset => (await fetch(asset)).ok,
      `./${releases.oldRelease.assetPrefix}/relay/sampling-worker.js`)).toBe(true);
    await page.reload();
    await expect(page.locator('#dds-status')).toHaveText('DDS ready');
    expect(await saved(page)).toEqual(before);
    await page.click('#undo-bid');
    expect((await saved(page)).session).toEqual(before.history.at(-1));
  } finally { releases.close(); }
});
