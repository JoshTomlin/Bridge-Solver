// Double-dummy estimates use independent complete deals: one uniformly random
// opponent split for each independently sampled, auction-compatible partner hand.
// Every contract is compared on exactly the same set of complete deals.
import { DECK, RANKS, SUITS, makeRng } from "./core.js";

const SEATS = ["North", "East", "South", "West"];
const STRAINS = [...SUITS, "NT"];
const PARTNERSHIP = ["North", "South"];

function practiceSeats(context) {
  if (context != null && (typeof context !== "object" || Array.isArray(context))) {
    throw new Error("Evaluation context must be an object.");
  }
  const playerSeat = context?.playerSeat ?? "South";
  const partnerSeat = context?.partnerSeat ?? (playerSeat === "South" ? "North" : "South");
  if (!PARTNERSHIP.includes(playerSeat) || !PARTNERSHIP.includes(partnerSeat) || playerSeat === partnerSeat) {
    throw new Error("Player and partner must occupy different North/South seats.");
  }
  return { playerSeat, partnerSeat };
}

function evaluationContext(context) {
  const seats = practiceSeats(context);
  if (!SUITS.includes(context?.trump)) throw new Error("Context trump must be S, H, D, or C.");
  const auction = context.auction ?? [];
  if (!Array.isArray(auction)) throw new Error("Context auction must be an array of calls.");
  for (const call of auction) {
    if (!call || !SEATS.includes(call.seat) || typeof call.bid !== "string" ||
        !/^(?:[1-7](?:NT|[SHDC])|P|PASS|X|XX|DOUBLE|REDOUBLE)$/.test(call.bid.trim().toUpperCase())) {
      throw new Error("Each auction call needs a valid seat and bid.");
    }
  }
  return { ...seats, trump: context.trump, auction };
}

/** Artificial bids count when determining the first N/S bidder of a strain. */
export function resolveDeclarer(strain, context) {
  if (!STRAINS.includes(strain)) throw new Error("Contract has an invalid strain.");
  const { auction, playerSeat } = evaluationContext(context);
  const firstBidder = auction.find((call) => PARTNERSHIP.includes(call.seat) &&
    /^[1-7](NT|[SHDC])$/.exec(call.bid.trim().toUpperCase())?.[1] === strain);
  return firstBidder?.seat ?? playerSeat;
}

// String seeds are intentional: entering the same seed reproduces the splits.
export const makeEvaluationRng = makeRng;

export function validateHand(hand, label = "Hand") {
  if (!Array.isArray(hand) || hand.length !== 13) {
    throw new Error(`${label} must contain exactly 13 cards.`);
  }
  const seen = new Set();
  for (const card of hand) {
    if (typeof card !== "string" || !/^[SHDC][AKQJT2-9]$/.test(card)) {
      throw new Error(`${label} contains an invalid card: ${String(card)}.`);
    }
    if (seen.has(card)) throw new Error(`${label} repeats ${card}.`);
    seen.add(card);
  }
  return hand;
}

export function validateDeal(deal) {
  if (!deal || typeof deal !== "object") throw new Error("A complete deal is required.");
  const seen = new Set();
  for (const seat of SEATS) {
    for (const card of validateHand(deal[seat], seat)) {
      if (seen.has(card)) throw new Error(`${card} appears in more than one hand.`);
      seen.add(card);
    }
  }
  return deal;
}

export function fillOpponentHands(playerHand, partnerHand, seedOrRng, context) {
  const { playerSeat, partnerSeat } = practiceSeats(context);
  validateHand(playerHand, playerSeat);
  validateHand(partnerHand, partnerSeat);
  const known = new Set([...playerHand, ...partnerHand]);
  if (known.size !== 26) throw new Error("North and South contain a shared card.");
  const rng = typeof seedOrRng === "function" ? seedOrRng : makeEvaluationRng(seedOrRng);
  const remaining = DECK.filter((card) => !known.has(card));
  // Fisher-Yates makes each East subset (and hence each West complement) equally likely.
  for (let i = remaining.length - 1; i > 0; i -= 1) {
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) {
      throw new Error("Random generator must return a number in [0, 1).");
    }
    const j = Math.floor(random * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  return {
    North: [...(playerSeat === "North" ? playerHand : partnerHand)],
    East: remaining.slice(0, 13),
    South: [...(playerSeat === "South" ? playerHand : partnerHand)],
    West: remaining.slice(13),
  };
}

export function createEvaluationDeals(playerHand, partnerHands, seed, context) {
  if (!Array.isArray(partnerHands)) throw new Error("Partner samples must be an array.");
  practiceSeats(context);
  // Keep the opponent stream distinct from the partner sampler's seed stream.
  const rng = makeEvaluationRng(`relay-opponents:${seed}`);
  return partnerHands.map((partnerHand) => fillOpponentHands(playerHand, partnerHand, rng, context));
}

export function handRecord(hand) {
  validateHand(hand);
  return SUITS.map((suit) => RANKS.filter((rank) => hand.includes(suit + rank)).join("") || "-").join(" ");
}

export function normalizeContract(contract, contextOrMajor) {
  const legacy = typeof contextOrMajor === "string";
  if (legacy && contextOrMajor !== "S" && contextOrMajor !== "H") throw new Error("Major must be S or H.");
  if (!legacy) evaluationContext(contextOrMajor);
  let level;
  let strain;
  let declarer;
  if (typeof contract === "string") {
    const match = /^([1-7])(NT|[SHDC])$/.exec(contract.trim().toUpperCase());
    if (!match) throw new Error("Contract must be a level and strain, such as 6S or 3NT.");
    level = Number(match[1]);
    strain = match[2];
  } else if (contract && typeof contract === "object") {
    ({ level, strain, declarer } = contract);
  }
  if (!Number.isInteger(level) || level < 1 || level > 7 || !STRAINS.includes(strain)) {
    throw new Error("Contract has an invalid level or strain.");
  }
  if (legacy) {
    // Keep the original 1M–2NT API: North opens; South bids the NT relay.
    if (!declarer && strain === contextOrMajor) declarer = "North";
    if (!declarer && strain === "NT") declarer = "South";
  } else {
    // Public auction evidence overrides any stale declarer stored on a contract.
    declarer = resolveDeclarer(strain, contextOrMajor);
  }
  if (!SEATS.includes(declarer)) {
    throw new Error("An explicit declarer is required for this contract strain.");
  }
  return { level, strain, declarer, key: `${level}${strain}-${declarer}` };
}

export function defaultContracts(contextOrMajor, selectedContract, otherContracts = []) {
  if (!Array.isArray(otherContracts)) throw new Error('Additional contracts must be an array.');
  const trump = typeof contextOrMajor === "string" ? contextOrMajor : evaluationContext(contextOrMajor).trump;
  const gameLevel = trump === "C" || trump === "D" ? 5 : 4;
  const contracts = [gameLevel, 6, 7].map((level) => normalizeContract(`${level}${trump}`, contextOrMajor));
  contracts.push(...[3, 6, 7].map((level) => normalizeContract(`${level}NT`, contextOrMajor)));
  if (selectedContract != null) contracts.push(normalizeContract(selectedContract, contextOrMajor));
  contracts.push(...otherContracts.map(contract => normalizeContract(contract, contextOrMajor)));
  return [...new Map(contracts.map((contract) => [contract.key, contract])).values()];
}

export function wilsonInterval(makes, total) {
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(makes) || makes < 0 || makes > total) {
    throw new Error("Wilson interval requires integer counts with 0 ≤ makes ≤ total and total > 0.");
  }
  const z = 1.959963984540054;
  const z2 = z * z;
  const proportion = makes / total;
  const denominator = 1 + z2 / total;
  const centre = (proportion + z2 / (2 * total)) / denominator;
  const halfWidth = z * Math.sqrt((proportion * (1 - proportion) + z2 / (4 * total)) / total) / denominator;
  return {
    low: makes === 0 ? 0 : Math.max(0, centre - halfWidth),
    high: makes === total ? 1 : Math.min(1, centre + halfWidth),
  };
}

export function evaluateTable(table, contracts) {
  if (table?.ok === false) throw new Error(table.error || "Double-dummy solver failed.");
  const tricks = table?.tricks ?? table;
  return contracts.map((contract) => {
    const count = tricks?.[contract.strain]?.[contract.declarer];
    if (!Number.isInteger(count) || count < 0 || count > 13) {
      throw new Error(`Invalid double-dummy trick count for ${contract.strain}, ${contract.declarer}.`);
    }
    return { ...contract, tricks: count, makes: count >= contract.level + 6 };
  });
}

export function aggregateTables(tables, contextOrMajor, selectedContract, otherContracts = []) {
  if (!Array.isArray(tables) || tables.length === 0) throw new Error("At least one double-dummy table is required.");
  const contracts = defaultContracts(contextOrMajor, selectedContract, otherContracts);
  const counts = contracts.map(() => 0);
  const totals = contracts.map(() => 0);
  const selected = selectedContract == null ? null : normalizeContract(selectedContract, contextOrMajor);
  const pairs = contracts.map(() => ({ bothMake: 0, assessedOnly: 0, alternativeOnly: 0, neitherMakes: 0 }));
  for (const table of tables) {
    const results = evaluateTable(table, contracts);
    const assessed = selected && results.find(result => result.key === selected.key);
    results.forEach((result, index) => {
      counts[index] += Number(result.makes);
      totals[index] += result.tricks;
      if (assessed) {
        const category = assessed.makes ? (result.makes ? 'bothMake' : 'assessedOnly')
          : (result.makes ? 'alternativeOnly' : 'neitherMakes');
        pairs[index][category] += 1;
      }
    });
  }
  return {
    sampleCount: tables.length,
    method: "double-dummy",
    samplingUnit: "independent complete deal",
    confidence: 0.95,
    intervalMethod: "Wilson",
    contracts: contracts.map((contract, index) => ({
      ...contract,
      makes: counts[index],
      total: tables.length,
      makeFraction: counts[index] / tables.length,
      averageTricks: totals[index] / tables.length,
      interval: wilsonInterval(counts[index], tables.length),
    })),
    ...(selected ? { assessment: {
      contract: selected,
      comparisons: contracts.map((contract, index) => ({ ...contract, ...pairs[index], total: tables.length }))
        .filter(contract => contract.key !== selected.key),
    } } : {}),
  };
}
