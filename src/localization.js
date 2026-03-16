const exactLegacyStringMap = new Map([
  [
    "\uacf5\uc2dd Polymarket leaderboard, positions, closed-positions, activity, trades, value, prices-history \uc5d4\ub4dc\ud3ec\uc778\ud2b8\ub97c \uc0ac\uc6a9\ud588\uc2b5\ub2c8\ub2e4.",
    "Official Polymarket leaderboard, positions, closed-positions, activity, trades, value, and prices-history endpoints were used.",
  ],
  [
    "\uc608\uce21 \uc815\ud655\ub3c4\ub294 \ucd5c\uadfc 90\uc77c closed positions\uc758 realized PnL\uc744 \ud504\ub85d\uc2dc\ub85c \uacc4\uc0b0\ud558\uace0, \uce74\ud53c \uc131\uacfc\ub294 \ucd5c\uadfc \uc2e4\uac70\ub798\ub97c \uae30\ubc18\uc73c\ub85c \uc7ac\uad6c\uc131\ud569\ub2c8\ub2e4.",
    "Forecast accuracy is estimated from realized PnL on closed positions over the last 90 days, and copy performance is reconstructed from recent live trades.",
  ],
  ["\uc2e0\uaddc \uc9c4\uc785", "New entry"],
  ["\ud3ec\uc9c0\uc158 \ucd95\uc18c", "Position reduction"],
  [
    "\ucd5c\uadfc \uc2e0\uaddc \uc9c4\uc785 \ub610\ub294 \ube44\uc911 \ud655\ub300\uac00 \uac10\uc9c0\ub418\uc5c8\uc2b5\ub2c8\ub2e4.",
    "A recent new entry or size increase was detected.",
  ],
  [
    "\ucd5c\uadfc \ud3ec\uc9c0\uc158 \ucd95\uc18c\uac00 \uac10\uc9c0\ub418\uc5c8\uc2b5\ub2c8\ub2e4.",
    "A recent position reduction was detected.",
  ],
]);

const relativeTimeMatchers = [
  [/^(\d+)\s*\ubd84 \uc804$/, (amount) => `${amount}m ago`],
  [/^(\d+)\s*\uc2dc\uac04 \uc804$/, (amount) => `${amount}h ago`],
  [/^(\d+)\s*\uc77c \uc804$/, (amount) => `${amount}d ago`],
];

const legacyTemplateMatchers = [
  [/^(.+?)\s+\uc2e0\uaddc \uc2dc\uadf8\ub110$/, (label) => `${label} new signal`],
  [/^(.+?)\s+\uad00\uc2ec \uc9d1\uc911$/, (label) => `${label} crowding alert`],
  [/^(.+?)\s+\ud65c\ub3d9 \uac10\uc9c0$/, (label) => `${label} activity detected`],
  [
    /^(.+?)\uac00 (.+) \uc2dc\uc7a5\uc5d0\uc11c \uc2e0\uaddc \uc9c4\uc785\ud588\uc2b5\ub2c8\ub2e4\.$/,
    (alias, market) => `${alias} posted a new entry signal in ${market}.`,
  ],
  [
    /^(.+?)\uac00 (.+) \uc2dc\uc7a5\uc5d0\uc11c \ud3ec\uc9c0\uc158 \ucd95\uc18c\ud588\uc2b5\ub2c8\ub2e4\.$/,
    (alias, market) => `${alias} posted a position reduction signal in ${market}.`,
  ],
  [
    /^(.+?)\uac00 (.+) \uc2dc\uc7a5\uc5d0\uc11c \uc2e0\uaddc \uc9c4\uc785 \uc2dc\uadf8\ub110\uc744 \ub0a8\uacbc\uc2b5\ub2c8\ub2e4\.$/,
    (alias, market) => `${alias} posted a new entry signal in ${market}.`,
  ],
  [
    /^(\d+)\uba85\uc758 \uc0c1\uc704 \ud2b8\ub808\uc774\ub354\uac00 \uac19\uc740 \uc2dc\uc7a5\uc5d0 \uc9c4\uc785\ud588\uc2b5\ub2c8\ub2e4\.$/,
    (count) => `${count} top traders entered the same market.`,
  ],
];

export function translateLegacyString(value) {
  const text = `${value || ""}`;
  if (!text) {
    return text;
  }

  const exactMatch = exactLegacyStringMap.get(text);
  if (exactMatch) {
    return exactMatch;
  }

  for (const [pattern, formatter] of relativeTimeMatchers) {
    const match = text.match(pattern);
    if (match) {
      return formatter(match[1]);
    }
  }

  for (const [pattern, formatter] of legacyTemplateMatchers) {
    const match = text.match(pattern);
    if (match) {
      return formatter(...match.slice(1));
    }
  }

  return text;
}

export function translateLegacyCopy(value) {
  if (typeof value === "string") {
    return translateLegacyString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => translateLegacyCopy(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translateLegacyCopy(item)]));
  }

  return value;
}
