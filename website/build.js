import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.dirname(fileURLToPath(import.meta.url));
export const staticFiles = [
  "index.html",
  "relay.html",
  "relay/app.js",
  "relay/table-ui.js",
  "relay/bid-preview.js",
  "relay/core.js",
  "relay/practice.js",
  "relay/progress.js",
  "relay/continuations.js",
  "relay/system.js",
  "relay/profile-utils.js",
  "relay/profiles.js",
  "relay/families.js",
  "relay/minor-profiles.js",
  "relay/club-profiles.js",
  "relay/strong-club-profiles.js",
  "relay/split-profiles.js",
  "relay/horton-profiles.js",
  "relay/rebid-profiles.js",
  "relay/source-utils.js",
  "relay/relay.css",
  "relay/sampling-worker.js",
  "relay/evaluation.js",
  "relay/evaluation-worker.js",
  "styles.css",
  "app.js",
  "deal-utils.js",
  "storage.js",
  "engine-client.js",
  "engine-worker.js"
];

export function buildWebsite({ sourceRoot = root, destination = path.join(root, 'dist'),
  wasmSource = process.env.BRIDGE_WASM_DIR || path.join(root, '..', 'build-wasm', 'wasm') } = {}) {
  const files = new Map(staticFiles.map(file => [file, fs.readFileSync(path.join(sourceRoot, file))]));
  for (const file of ['bridge_engine.js', 'bridge_engine.wasm']) {
    const source = path.join(wasmSource, file);
    if (fs.existsSync(source)) files.set(`engine/${file}`, fs.readFileSync(source));
  }

  // Version the whole module graph, including workers and WASM. A query on the
  // entry script alone would still allow cached transitive modules to mix builds.
  const hash = createHash('sha256');
  for (const [file, contents] of files) hash.update(`${file}\0${contents.length}\0`).update(contents);
  const version = hash.digest('hex').slice(0, 20);
  const assetPrefix = `assets/${version}`;
  fs.rmSync(destination, { recursive: true, force: true });
  const write = (file, contents) => {
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  for (const [file, contents] of files) {
    if (file.endsWith('.html')) {
      write(file, contents.toString().replace(/\b(src|href)="\.\/([^"\s]+\.(?:css|js))"/g,
        (_, attribute, asset) => `${attribute}="./${assetPrefix}/${asset}"`));
    } else {
      write(`${assetPrefix}/${file}`, contents);
      // Keep the original paths for Node engine tests and command-line tools.
      write(file, contents);
    }
  }
  write('.nojekyll', '');
  return { destination, version, assetPrefix };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { destination, version } = buildWebsite();
  console.log(`Built static site in ${destination} (assets ${version})`);
}
