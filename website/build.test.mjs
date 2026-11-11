import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWebsite, staticFiles } from './build.js';

test('HTML and the complete runtime graph share a content version', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-assets-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const sourceRoot = path.join(temp, 'source');
  const wasmSource = path.join(temp, 'wasm');
  const destination = path.join(temp, 'dist');
  for (const file of staticFiles) {
    fs.mkdirSync(path.dirname(path.join(sourceRoot, file)), { recursive: true });
    fs.copyFileSync(fileURLToPath(new URL(file, import.meta.url)), path.join(sourceRoot, file));
  }
  fs.mkdirSync(wasmSource);
  fs.writeFileSync(path.join(wasmSource, 'bridge_engine.js'), 'export default {};');
  fs.writeFileSync(path.join(wasmSource, 'bridge_engine.wasm'), Buffer.from([0, 97, 115, 109]));
  const build = () => buildWebsite({ sourceRoot, wasmSource, destination });
  const first = build();
  for (const html of ['index.html', 'relay.html']) {
    const built = fs.readFileSync(path.join(destination, html), 'utf8');
    const assets = [...built.matchAll(/\b(?:src|href)="\.\/([^"\s]+\.(?:css|js))"/g)].map(match => match[1]);
    assert.ok(assets.length >= 2);
    for (const asset of assets) {
      assert.ok(asset.startsWith(`${first.assetPrefix}/`));
      assert.ok(fs.existsSync(path.join(destination, asset)));
    }
  }
  for (const file of [...staticFiles.filter(file => !file.endsWith('.html')), 'engine/bridge_engine.js', 'engine/bridge_engine.wasm']) {
    assert.deepEqual(fs.readFileSync(path.join(destination, first.assetPrefix, file)), fs.readFileSync(path.join(destination, file)));
  }
  assert.equal(build().version, first.version, 'Identical builds keep their version');
  const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'relay.webmanifest'), 'utf8'));
  const manifestUrl = 'https://example.test/Bridge-Solver/relay.webmanifest';
  assert.equal(new URL(manifest.start_url, manifestUrl).href, 'https://example.test/Bridge-Solver/relay.html');
  assert.equal(new URL(manifest.id, manifestUrl).href, 'https://example.test/Bridge-Solver/relay.html');
  assert.equal(new URL(manifest.scope, manifestUrl).href, 'https://example.test/Bridge-Solver/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const png = fs.readFileSync(path.join(destination, icon.src));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  const worker = fs.readFileSync(path.join(destination, 'relay-sw.js'), 'utf8');
  assert.ok(!worker.includes('__RELAY_VERSION__') && !worker.includes('__RELAY_FILES__'));
  const offlineFiles = JSON.parse(worker.match(/const FILES = (\[.*\]);/)[1]);
  for (const file of offlineFiles) assert.ok(fs.existsSync(path.join(destination, file)), file);
  for (const required of ['relay/app.js', 'relay/install.js', 'relay/sampling-worker.js', 'relay/evaluation-worker.js', 'engine/bridge_engine.wasm']) {
    assert.ok(offlineFiles.includes(`${first.assetPrefix}/${required}`), `${required} works offline`);
  }
  assert.deepEqual(fs.readFileSync(path.join(destination, first.assetPrefix, 'relay.html')), fs.readFileSync(path.join(destination, 'relay.html')));
  let previous = first.version;
  for (const file of ['relay/families.js', 'relay/sampling-worker.js', 'relay/evaluation-worker.js', 'relay/relay.css', 'relay-sw.js', 'relay.webmanifest']) {
    fs.appendFileSync(path.join(sourceRoot, file), '\n/* changed */\n');
    const next = build();
    assert.notEqual(next.version, previous, `${file} invalidates every runtime URL`);
    previous = next.version;
  }
  fs.appendFileSync(path.join(wasmSource, 'bridge_engine.wasm'), Buffer.from([1]));
  assert.notEqual(build().version, previous, 'A changed engine invalidates every runtime URL');
});
