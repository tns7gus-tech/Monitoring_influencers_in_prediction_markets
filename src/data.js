export const traders = [
  {
    id: "atlas-flow",
    alias: "Atlas Flow",
    wallet: "0x95f9c7d3f847b4cf68d3fd1402d63d10f3e47f31",
    platform: "Polymarket",
    focus: ["US Politics", "Macro", "Crypto"],
    forecastAccuracy30d: 74,
    forecastAccuracy90d: 71,
    amountWeightedAccuracy90d: 76,
    realizedRoi90d: 18.2,
    settledMarkets90d: 54,
    activeDays30d: 24,
    trackedCategories: 3,
    recencyConsistency: 84,
    avgEntryEdgeBps: 94,
    openPositions: 6,
    openExposure: 21240,
    latencySensitivity: 0.011,
    copySharpe: 1.44,
    recentSignal: {
      market: "Fed cuts in June 2026",
      side: "YES",
      action: "New entry",
      conviction: "High"
    }
  },
  {
    id: "seoul-signal",
    alias: "Seoul Signal",
    wallet: "0x466cc6f2776f8b3557eedff5f5cb9c7b1c3a0a4b",
    platform: "Polymarket",
    focus: ["Asia Politics", "Tech", "Crypto"],
    forecastAccuracy30d: 72,
    forecastAccuracy90d: 69,
    amountWeightedAccuracy90d: 73,
    realizedRoi90d: 14.9,
    settledMarkets90d: 41,
    activeDays30d: 21,
    trackedCategories: 3,
    recencyConsistency: 79,
    avgEntryEdgeBps: 88,
    openPositions: 5,
    openExposure: 15480,
    latencySensitivity: 0.013,
    copySharpe: 1.29,
    recentSignal: {
      market: "Ethereum ETF net inflow positive this week",
      side: "YES",
      action: "Position increase",
      conviction: "Medium"
    }
  },
  {
    id: "orbital-edge",
    alias: "Orbital Edge",
    wallet: "0xd7f7fdce17441f7cfcb7702b74999d7f7256b777",
    platform: "Polymarket",
    focus: ["Sports", "Regulation", "US Politics"],
    forecastAccuracy30d: 70,
    forecastAccuracy90d: 68,
    amountWeightedAccuracy90d: 72,
    realizedRoi90d: 12.1,
    settledMarkets90d: 38,
    activeDays30d: 18,
    trackedCategories: 3,
    recencyConsistency: 82,
    avgEntryEdgeBps: 91,
    openPositions: 4,
    openExposure: 11820,
    latencySensitivity: 0.015,
    copySharpe: 1.18,
    recentSignal: {
      market: "Starship orbital test succeeds by Q3",
      side: "YES",
      action: "New entry",
      conviction: "High"
    }
  },
  {
    id: "delta-civil",
    alias: "Delta Civil",
    wallet: "0x1b67e7b216571c741b52df0f1f728097c7164bc9",
    platform: "Polymarket",
    focus: ["US Politics", "Global Politics"],
    forecastAccuracy30d: 68,
    forecastAccuracy90d: 66,
    amountWeightedAccuracy90d: 71,
    realizedRoi90d: 11.4,
    settledMarkets90d: 47,
    activeDays30d: 19,
    trackedCategories: 2,
    recencyConsistency: 77,
    avgEntryEdgeBps: 86,
    openPositions: 7,
    openExposure: 26590,
    latencySensitivity: 0.017,
    copySharpe: 1.12,
    recentSignal: {
      market: "House control after midterms",
      side: "NO",
      action: "Position increase",
      conviction: "Medium"
    }
  },
  {
    id: "binary-whale",
    alias: "Binary Whale",
    wallet: "0x7db4a5b85015bc64ee91b6ecf4c10e5f7d4f57e7",
    platform: "Polymarket",
    focus: ["Crypto", "Macro"],
    forecastAccuracy30d: 67,
    forecastAccuracy90d: 65,
    amountWeightedAccuracy90d: 69,
    realizedRoi90d: 21.7,
    settledMarkets90d: 29,
    activeDays30d: 16,
    trackedCategories: 2,
    recencyConsistency: 72,
    avgEntryEdgeBps: 79,
    openPositions: 3,
    openExposure: 34850,
    latencySensitivity: 0.02,
    copySharpe: 1.03,
    recentSignal: {
      market: "Bitcoin above 120k by year-end",
      side: "YES",
      action: "New entry",
      conviction: "High"
    }
  },
  {
    id: "quiet-axiom",
    alias: "Quiet Axiom",
    wallet: "0x2ef381f7a117fa7c74346511e906af34abf8f0b2",
    platform: "Polymarket",
    focus: ["Healthcare", "Regulation", "US Politics"],
    forecastAccuracy30d: 66,
    forecastAccuracy90d: 64,
    amountWeightedAccuracy90d: 68,
    realizedRoi90d: 8.9,
    settledMarkets90d: 34,
    activeDays30d: 15,
    trackedCategories: 3,
    recencyConsistency: 75,
    avgEntryEdgeBps: 83,
    openPositions: 4,
    openExposure: 8920,
    latencySensitivity: 0.016,
    copySharpe: 0.98,
    recentSignal: {
      market: "FDA approval before September",
      side: "YES",
      action: "New entry",
      conviction: "Medium"
    }
  }
];

export const signalFeed = [
  {
    traderId: "atlas-flow",
    timestamp: "5m ago",
    market: "Fed cuts in June 2026",
    action: "New entry",
    side: "YES",
    size: "$6.2k",
    note: "Opened the first position at 0.43."
  },
  {
    traderId: "seoul-signal",
    timestamp: "12m ago",
    market: "Ethereum ETF net inflow positive this week",
    action: "Position increase",
    side: "YES",
    size: "$3.4k",
    note: "Added size 4c above the previous average entry price."
  },
  {
    traderId: "binary-whale",
    timestamp: "28m ago",
    market: "Bitcoin above 120k by year-end",
    action: "New entry",
    side: "YES",
    size: "$9.8k",
    note: "Large entry, but delayed followers face meaningful slippage risk."
  },
  {
    traderId: "delta-civil",
    timestamp: "43m ago",
    market: "House control after midterms",
    action: "Position increase",
    side: "NO",
    size: "$4.1k",
    note: "Re-entry into the same theme suggests conviction is still intact."
  }
];

export const marketThemes = [
  {
    category: "US Politics",
    momentum: "Concentrated",
    divergence: "Low",
    notableMarkets: ["House control after midterms", "Trump nominee by convention"],
    consensusBias: "NO bias among top forecasters"
  },
  {
    category: "Crypto",
    momentum: "Rising",
    divergence: "High",
    notableMarkets: ["Bitcoin above 120k by year-end", "Ethereum ETF net inflow positive this week"],
    consensusBias: "YES bias but timing split"
  },
  {
    category: "Macro",
    momentum: "Early accumulation",
    divergence: "Medium",
    notableMarkets: ["Fed cuts in June 2026", "US CPI below 2.5 by Q4"],
    consensusBias: "Top wallets entering before price shift"
  },
  {
    category: "Healthcare",
    momentum: "Selective",
    divergence: "Low",
    notableMarkets: ["FDA approval before September", "Drug pricing bill passage"],
    consensusBias: "Small but accurate wallets dominate"
  }
];

export const defaultWatchlist = [
  {
    label: "Macro scout",
    wallet: "0x95f9c7d3f847b4cf68d3fd1402d63d10f3e47f31",
    thesis: "Fast early entries in rates and macro markets."
  },
  {
    label: "Asia tech",
    wallet: "0x466cc6f2776f8b3557eedff5f5cb9c7b1c3a0a4b",
    thesis: "Consistent read on Asia politics and tech events."
  }
];

export const fallbackSnapshot = {
  generatedAt: "2026-03-14T00:00:00.000Z",
  source: "fallback",
  platform: "Polymarket",
  notes: [
    "This is fallback data.",
    "A demo snapshot is shown until live data is synced."
  ],
  traders,
  signalFeed,
  marketThemes,
};
