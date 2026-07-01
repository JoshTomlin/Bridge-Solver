const DEAL_KEY = "bridge-lab.deals.v1";
const RUN_KEY = "bridge-lab.runs.v1";

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function identifier() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

export function loadDeals() {
  return read(DEAL_KEY);
}

export function saveDeal(deal) {
  const deals = loadDeals();
  const stored = {
    ...deal,
    id: deal.id || identifier(),
    updatedAt: new Date().toISOString()
  };
  const existing = deals.findIndex((candidate) => candidate.id === stored.id);
  if (existing >= 0) deals.splice(existing, 1, stored);
  else deals.unshift(stored);
  write(DEAL_KEY, deals);
  return stored;
}

export function deleteDeal(id) {
  write(DEAL_KEY, loadDeals().filter((deal) => deal.id !== id));
}

export function loadRuns() {
  return read(RUN_KEY);
}

export function saveRun(run) {
  const runs = [{ ...run, id: identifier(), createdAt: new Date().toISOString() }, ...loadRuns()];
  const retained = runs.slice(0, 24);
  while (retained.length) {
    try {
      write(RUN_KEY, retained);
      break;
    } catch {
      retained.pop();
    }
  }
  return runs[0];
}

export function clearRuns() {
  write(RUN_KEY, []);
}
