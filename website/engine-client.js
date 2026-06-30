export class EngineClient {
  constructor({ onStatus, onProgress } = {}) {
    this.onStatus = onStatus;
    this.onProgress = onProgress;
    this.sequence = 0;
    this.pending = new Map();
    this.startWorker();
  }

  startWorker() {
    this.worker = new Worker(new URL("./engine-worker.js", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", (event) => this.handleMessage(event.data));
    this.worker.addEventListener("error", (event) => {
      this.onStatus?.("error", event.message || "Engine worker failed");
    });
    this.onStatus?.("loading", "Loading WebAssembly");
  }

  handleMessage(message) {
    if (message.type === "status") {
      this.onStatus?.(message.status, message.message);
      return;
    }
    if (message.type === "progress") {
      this.onProgress?.(message.progress);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  }

  request(command, payload = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, command, payload });
    });
  }

  createSession(deal) {
    return this.request("create", deal);
  }

  analyze(settings) {
    return this.request("analyze", settings);
  }

  play(card) {
    return this.request("play", { card });
  }

  undo() {
    return this.request("undo");
  }

  replay() {
    return this.request("replay");
  }

  runFull(settings) {
    return this.request("run-full", settings);
  }

  cancel() {
    for (const { reject } of this.pending.values()) reject(new Error("Analysis stopped"));
    this.pending.clear();
    this.worker.terminate();
    this.startWorker();
  }
}
