import { fallbackSnapshot } from "./data.js";
import { buildMarketThemesFromSignals } from "./categories.js";
import { translateLegacyCopy } from "./localization.js";

function withDefaults(target, defaults) {
  return { ...defaults, ...(target || {}) };
}

function normalizeRecentSignal(signal) {
  return withDefaults(translateLegacyCopy(signal), {
    market: "No recent activity",
    side: "N/A",
    action: "Monitoring",
    conviction: "Low",
  });
}

function normalizeTrader(trader) {
  const normalized = translateLegacyCopy(withDefaults(trader, {
    id: `wallet-${Math.random().toString(16).slice(2)}`,
    alias: "Unnamed trader",
    wallet: "0x0000000000000000000000000000000000000000",
    platform: "Polymarket",
    focus: ["General"],
    forecastAccuracy30d: 0,
    forecastAccuracy90d: 0,
    amountWeightedAccuracy90d: 0,
    realizedRoi90d: 0,
    settledMarkets90d: 0,
    activeDays30d: 0,
    trackedCategories: 1,
    recencyConsistency: 0,
    avgEntryEdgeBps: 0,
    openPositions: 0,
    openExposure: 0,
    latencySensitivity: 0.016,
    copySharpe: 0.8,
    recentActivities: [],
  }));

  return {
    ...normalized,
    focus: normalized.focus?.length ? normalized.focus : ["General"],
    recentSignal: normalizeRecentSignal(normalized.recentSignal),
  };
}

function normalizeSignal(signal) {
  return withDefaults(translateLegacyCopy(signal), {
    traderId: "unknown",
    timestamp: "Just now",
    market: "Unknown market",
    action: "Monitoring",
    side: "N/A",
    size: "$0",
    note: "No recent events.",
  });
}

export function normalizeSnapshot(snapshot) {
  const normalized = translateLegacyCopy(withDefaults(snapshot, {
    generatedAt: new Date().toISOString(),
    source: "fallback",
    platform: "Polymarket",
    notes: [],
    traders: [],
    signalFeed: [],
    marketThemes: [],
  }));

  const traders = normalized.traders.map(normalizeTrader);
  const signalFeed = normalized.signalFeed.map(normalizeSignal);
  const marketThemes = normalized.marketThemes.length
    ? normalized.marketThemes
    : buildMarketThemesFromSignals(signalFeed, traders);

  return {
    ...normalized,
    traders,
    signalFeed,
    marketThemes,
  };
}

export function createFallbackSnapshot() {
  return normalizeSnapshot(structuredClone(fallbackSnapshot));
}
