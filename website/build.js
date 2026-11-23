import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = path.dirname(fileURLToPath(import.meta.url));
export const staticFiles = [
  "index.html",
  "relay.html",
  "relay.webmanifest",
  "relay-sw.js",
  "icons/relay.svg",
  "icons/relay-180.png",
  "icons/relay-192.png",
  "icons/relay-512.png",
  "relay/app.js",
  "relay/install.js",
  "relay/table-ui.js",
  "relay/seat-view.js",
  "relay/auction-study.js",
  "relay/hand-history.js",
  "relay/hand-history-ui.js",
  "relay/bid-preview.js",
  "relay/bid-descriptions.js",
  "relay/bid-reference.js",
  "relay/rebid-reference.js",
  "relay/core.js",
  "relay/practice.js",
  "relay/slam-policy.js",
  "relay/opening-practice.js",
  "relay/club-suit-responses.js",
  "relay/opening-system.js",
  "relay/nt-opening.js",
  "relay/natural-opening.js",
  "relay/preempt-opening.js",
  "relay/diamond-raise.js",
  "relay/weak-notrump.js",
  "relay/weak-notrump-competition.js",
  "relay/strong-club-two.js",
  "relay/passed-hand.js",
  "relay/major-opening.js",
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

function releaseFromGit(sourceRoot) {
  let revision, committedAt;
  try {
    [revision, committedAt] = execFileSync('git', ['log', '-1', '--format=%H%n%cI'], {
      cwd: sourceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split('\n');
  } catch {
    return null;
  }
  if (process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const pushedAt = event.repository?.pushed_at;
    if (event.after === revision && pushedAt) {
      const timestamp = new Date(typeof pushedAt === 'number' ? pushedAt * 1000 : pushedAt);
      if (!Number.isNaN(timestamp.valueOf())) return { revision, timestamp, pushed: true };
    }
  }
  return { revision, timestamp: new Date(committedAt), pushed: false };
}

function buildLabel(release) {
  if (!release) return 'Local preview';
  const datetime = release.timestamp.toISOString();
  const date = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
  }).format(release.timestamp);
  const label = release.pushed ? 'Pushed' : 'Commit from';
  return `<span data-revision="${release.revision}">${label} <time datetime="${datetime}">${date}</time> · ${release.revision.slice(0, 7)}</span>`;
}

export function buildWebsite({ sourceRoot = root, destination = path.join(root, 'dist'),
  wasmSource = process.env.BRIDGE_WASM_DIR || path.join(root, '..', 'build-wasm', 'wasm'),
  release = releaseFromGit(sourceRoot) } = {}) {
  const label = buildLabel(release);
  const files = new Map(staticFiles.map(file => [file, fs.readFileSync(path.join(sourceRoot, file))]));
  for (const file of ['bridge_engine.js', 'bridge_engine.wasm']) {
    const source = path.join(wasmSource, file);
    if (fs.existsSync(source)) files.set(`engine/${file}`, fs.readFileSync(source));
  }

  // Version the whole module graph, including workers and WASM. A query on the
  // entry script alone would still allow cached transitive modules to mix builds.
  const hash = createHash('sha256');
  for (const [file, contents] of files) hash.update(`${file}\0${contents.length}\0`).update(contents);
  hash.update(label);
  const version = hash.digest('hex').slice(0, 20);
  const assetPrefix = `assets/${version}`;
  fs.rmSync(destination, { recursive: true, force: true });
  const write = (file, contents) => {
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  const offlineFiles = ['relay.webmanifest', ...[...files.keys()].filter(file => file.startsWith('icons/')),
    ...[...files.keys()].filter(file => file !== 'relay-sw.js' && file !== 'relay.webmanifest' && !file.startsWith('icons/'))
      .map(file => `${assetPrefix}/${file}`)];
  for (const [file, contents] of files) {
    if (file.endsWith('.html')) {
      let html = contents.toString().replace(/\b(src|href)="\.\/([^"\s]+\.(?:css|js))"/g,
        (_, attribute, asset) => `${attribute}="./${assetPrefix}/${asset}"`);
      html = html.replace('<!-- release-stamp -->Local preview', label);
      html = html.replace('</head>', `<meta name="relay-build" content="${version}">\n  </head>`);
      // Served at the original URL when offline so relative links still work.
      write(`${assetPrefix}/${file}`, html);
      write(file, html);
    } else {
      const output = file === 'relay-sw.js' ? contents.toString()
        .replace('__RELAY_VERSION__', version).replace('__RELAY_FILES__', JSON.stringify(offlineFiles)) : contents;
      write(`${assetPrefix}/${file}`, output);
      // Keep the original paths for Node engine tests and command-line tools.
      write(file, output);
    }
  }
  write('.nojekyll', '');
  return { destination, version, assetPrefix };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { destination, version } = buildWebsite();
  console.log(`Built static site in ${destination} (assets ${version})`);
}
