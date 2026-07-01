import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const destination = path.join(root, "dist");
const wasmSource = process.env.BRIDGE_WASM_DIR || path.join(root, "..", "build-wasm", "wasm");
const staticFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "deal-utils.js",
  "storage.js",
  "engine-client.js",
  "engine-worker.js"
];

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
for (const file of staticFiles) {
  fs.copyFileSync(path.join(root, file), path.join(destination, file));
}

const engineDestination = path.join(destination, "engine");
fs.mkdirSync(engineDestination, { recursive: true });
for (const file of ["bridge_engine.js", "bridge_engine.wasm"]) {
  const source = path.join(wasmSource, file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(engineDestination, file));
}

fs.writeFileSync(path.join(destination, ".nojekyll"), "");
console.log(`Built static site in ${destination}`);
