const SEATS = ["North", "East", "South", "West"];
const SUITS = ["S", "H", "D", "C"];
const RANKS = "AKQJT98765432";

export function parseHandRecord(record) {
  const text = String(record || "").trim().toUpperCase();
  if (!text) return { count: 0, cards: [] };

  const fields = text.split(/[.\s]+/);
  if (fields.length !== SUITS.length) {
    throw new Error("Each hand needs four holdings in SHDC order");
  }

  const cards = [];
  for (let index = 0; index < SUITS.length; index += 1) {
    const holding = fields[index] === "-" ? "" : fields[index];
    for (const rank of holding) {
      if (!RANKS.includes(rank)) throw new Error(`Invalid rank '${rank}'`);
      const card = `${SUITS[index]}${rank}`;
      if (cards.includes(card)) throw new Error(`Duplicate card ${card}`);
      cards.push(card);
    }
  }
  return { count: cards.length, cards };
}

export function handRecordFromCards(cards) {
  const cardSet = new Set(cards);
  return SUITS.map((suit) => {
    const holding = [...RANKS].filter((rank) => cardSet.has(`${suit}${rank}`)).join("");
    return holding || "-";
  }).join(".");
}

export function completeDefenderLayout(baseEastRecord, baseWestRecord, eastRecord, westRecord) {
  const baseEast = parseHandRecord(baseEastRecord);
  const baseWest = parseHandRecord(baseWestRecord);
  if (!baseEast.count || !baseWest.count) {
    throw new Error("Enter the base East and West hands before adding layouts");
  }

  const defenderPool = new Set([...baseEast.cards, ...baseWest.cards]);
  if (defenderPool.size !== baseEast.count + baseWest.count) {
    throw new Error("The base defender hands contain duplicate cards");
  }

  let east = parseHandRecord(eastRecord);
  let west = parseHandRecord(westRecord);
  if (!east.count && !west.count) {
    throw new Error("Enter East or West for the alternative layout");
  }
  if (!east.count) {
    const cards = [...defenderPool].filter((card) => !west.cards.includes(card));
    east = {
      count: cards.length,
      cards
    };
  }
  if (!west.count) {
    const cards = [...defenderPool].filter((card) => !east.cards.includes(card));
    west = {
      count: cards.length,
      cards
    };
  }
  if (east.count !== baseEast.count || west.count !== baseWest.count) {
    throw new Error(`Alternative layouts need ${baseEast.count} East cards and ${baseWest.count} West cards`);
  }

  const combined = [...east.cards, ...west.cards];
  if (new Set(combined).size !== combined.length ||
      combined.some((card) => !defenderPool.has(card)) ||
      combined.length !== defenderPool.size) {
    throw new Error("The alternative must redistribute exactly the same defender cards");
  }
  return {
    east: handRecordFromCards(east.cards),
    west: handRecordFromCards(west.cards)
  };
}

export function fourthHandCompletion(hands) {
  const parsed = {};
  try {
    for (const seat of SEATS) parsed[seat] = parseHandRecord(hands[seat]);
  } catch (error) {
    return { ready: false, message: error.message };
  }

  const missing = SEATS.filter((seat) => parsed[seat].count === 0);
  if (missing.length > 1) {
    return { ready: false, message: "Enter any three complete hands" };
  }

  const missingSeat = missing[0] || null;
  for (const seat of SEATS) {
    if (seat !== missingSeat && parsed[seat].count !== 13) {
      return {
        ready: false,
        message: `${seat} has ${parsed[seat].count} cards; enter 13`
      };
    }
  }

  const entered = new Set();
  for (const seat of SEATS) {
    if (seat === missingSeat) continue;
    for (const card of parsed[seat].cards) {
      if (entered.has(card)) {
        return { ready: false, message: `${card} appears in more than one hand` };
      }
      entered.add(card);
    }
  }

  if (!missingSeat) {
    return { ready: false, message: "All four hands are entered" };
  }

  const remaining = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const card = `${suit}${rank}`;
      if (!entered.has(card)) remaining.push(card);
    }
  }
  if (remaining.length !== 13) {
    return { ready: false, message: `The remaining hand has ${remaining.length} cards` };
  }

  return {
    ready: true,
    seat: missingSeat,
    record: handRecordFromCards(remaining),
    message: `Fill ${missingSeat} from the 13 remaining cards`
  };
}
