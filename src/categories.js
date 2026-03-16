const CATEGORY_RULES = [
  {
    name: "US Politics",
    patterns: [
      /\btrump\b/i,
      /\bbiden\b/i,
      /\bhouse\b/i,
      /\bsenate\b/i,
      /\bcongress\b/i,
      /\bwhite house\b/i,
      /\brepublican\b/i,
      /\bdemocrat\b/i,
      /\bsupreme court\b/i,
      /\bmidterms?\b/i,
    ],
  },
  {
    name: "Global Politics",
    patterns: [
      /\bukraine\b/i,
      /\brussia\b/i,
      /\bchina\b/i,
      /\btaiwan\b/i,
      /\bnorth korea\b/i,
      /\bisrael\b/i,
      /\bgaza\b/i,
      /\beu\b/i,
      /\bunited nations\b/i,
    ],
  },
  {
    name: "Crypto",
    patterns: [
      /\bbitcoin\b/i,
      /\bbtc\b/i,
      /\beth\b/i,
      /\bethereum\b/i,
      /\bsolana\b/i,
      /\betf\b/i,
      /\bdefi\b/i,
      /\bstablecoin\b/i,
      /\bcrypto\b/i,
      /\btoken\b/i,
    ],
  },
  {
    name: "Macro",
    patterns: [
      /\bfed\b/i,
      /\bcpi\b/i,
      /\binflation\b/i,
      /\brate cut/i,
      /\brate hike/i,
      /\bjobs report\b/i,
      /\bgdp\b/i,
      /\btreasury\b/i,
      /\bunemployment\b/i,
    ],
  },
  {
    name: "Sports",
    patterns: [
      /\bnba\b/i,
      /\bnhl\b/i,
      /\bnfl\b/i,
      /\bmlb\b/i,
      /\bsoccer\b/i,
      /^will .* win/i,
      /\bfc\b/i,
      /\bvs\.\b/i,
      /\bspread\b/i,
      /\bchampionship\b/i,
      /\bworld cup\b/i,
    ],
  },
  {
    name: "Tech",
    patterns: [
      /\bopenai\b/i,
      /\bai\b/i,
      /\btesla\b/i,
      /\bnvidia\b/i,
      /\bapple\b/i,
      /\bmeta\b/i,
      /\bgoogle\b/i,
      /\bmicrosoft\b/i,
      /\btiktok\b/i,
    ],
  },
  {
    name: "Healthcare",
    patterns: [
      /\bfda\b/i,
      /\bdrug\b/i,
      /\bvaccine\b/i,
      /\bhealth\b/i,
      /\bbiotech\b/i,
      /\bclinical\b/i,
      /\bapproval\b/i,
    ],
  },
  {
    name: "Regulation",
    patterns: [
      /\bsec\b/i,
      /\bcourt\b/i,
      /\blawsuit\b/i,
      /\bbill\b/i,
      /\bjudge\b/i,
      /\bconvicted\b/i,
      /\bban\b/i,
      /\bregulation\b/i,
    ],
  },
];

export function inferCategoriesFromText(text) {
  const normalized = `${text || ""}`.trim();
  if (!normalized) {
    return ["General"];
  }

  const matches = CATEGORY_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(normalized))
  ).map((rule) => rule.name);

  return matches.length ? matches : ["General"];
}

export function pickTopCategories(items, max = 3) {
  const counts = new Map();

  for (const item of items) {
    for (const category of inferCategoriesFromText(item)) {
      counts.set(category, (counts.get(category) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, max)
    .map(([category]) => category);
}

export function buildMarketThemesFromSignals(signalFeed, traders) {
  const categoryMap = new Map();
  const traderMap = new Map(traders.map((trader) => [trader.id, trader]));

  for (const signal of signalFeed) {
    const trader = traderMap.get(signal.traderId);
    const categories = trader?.focus?.length
      ? trader.focus
      : inferCategoriesFromText(`${signal.market} ${signal.note || ""}`);

    for (const category of categories) {
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          momentumCount: 0,
          buyCount: 0,
          sellCount: 0,
          markets: new Set(),
        });
      }

      const bucket = categoryMap.get(category);
      bucket.momentumCount += 1;
      bucket.markets.add(signal.market);
      if (/(reduce|reduction|trim|sell)/i.test(signal.action) || signal.side === "SELL") {
        bucket.sellCount += 1;
      } else {
        bucket.buyCount += 1;
      }
    }
  }

  return [...categoryMap.values()]
    .sort((left, right) => right.momentumCount - left.momentumCount)
    .slice(0, 4)
    .map((bucket) => ({
      category: bucket.category,
      momentum:
        bucket.momentumCount >= 4 ? "Crowded" : bucket.momentumCount >= 2 ? "Active" : "Early",
      divergence:
        Math.abs(bucket.buyCount - bucket.sellCount) <= 1
          ? "High"
          : bucket.buyCount > bucket.sellCount
            ? "Low"
            : "Medium",
      notableMarkets: [...bucket.markets].slice(0, 2),
      consensusBias:
        bucket.buyCount >= bucket.sellCount
          ? "YES bias among tracked forecasters"
          : "Mixed or defensive positioning",
    }));
}

