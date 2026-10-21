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
  let previous = first.version;
  for (const file of ['relay/families.js', 'relay/sampling-worker.js', 'relay/evaluation-worker.js', 'relay/relay.css']) {
    fs.appendFileSync(path.join(sourceRoot, file), '\n/* changed */\n');
    const next = build();
    assert.notEqual(next.version, previous, `${file} invalidates every runtime URL`);
    previous = next.version;
  }
  fs.appendFileSync(path.join(wasmSource, 'bridge_engine.wasm'), Buffer.from([1]));
  assert.notEqual(build().version, previous, 'A changed engine invalidates every runtime URL');
});
