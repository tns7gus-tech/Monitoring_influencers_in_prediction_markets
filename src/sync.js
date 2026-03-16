import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildBacktestSummary } from "./backtest.js";
import { buildMarketThemesFromSignals, pickTopCategories } from "./categories.js";
import {
  fetchClosedPositions,
  fetchLeaderboard,
  fetchPricesHistory,
  fetchUserActivity,
  fetchUserPositions,
  fetchUserTrades,
  fetchUserValue,
} from "./polymarket.js";
import { createFallbackSnapshot, normalizeSnapshot } from "./snapshot.js";

export const snapshotFilePath = resolve("data", "polymarket-snapshot.json");

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function median(values) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function toTimestampMs(value) {
  if (typeof value === "number") {
    return value > 1e12 ? value : value * 1000;
  }

  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function isWithinDays(value, days, nowMs) {
  const timestampMs = toTimestampMs(value);
  if (!timestampMs) {
    return false;
  }
  return timestampMs >= nowMs - days * 24 * 60 * 60 * 1000;
}

function uniqueCount(items, selector) {
  return new Set(items.map(selector).filter(Boolean)).size;
}

function uniqueDayCount(items, selector) {
  return new Set(
    items
      .map(selector)
      .map((value) => {
        const timestamp = toTimestampMs(value);
        return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : null;
      })
      .filter(Boolean)
  ).size;
}

function formatRelativeTimestamp(timestampMs, nowMs) {
  const diffMinutes = Math.max(1, Math.round((nowMs - timestampMs) / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function shortWallet(wallet) {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function slugifyText(value) {
  return `${value || ""}`
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown-market";
}

function normalizeTradeEntry(trade) {
  const price = clamp(asNumber(trade.price), 0.001, 0.999);
  const size = asNumber(trade.size || trade.lastSize || trade.outcomeShares);
  const sizeUsd = asNumber(trade.sizeUsd || trade.usdcSize || trade.amount || size * price);
  const timestampMs = toTimestampMs(trade.timestamp || trade.createdAt || trade.time);
  const marketTitle = trade.title || trade.market || trade.slug || trade.eventSlug || "Unknown market";

  return {
    asset: `${trade.asset || trade.assetId || ""}`,
    conditionId: `${trade.conditionId || ""}`,
    eventSlug: trade.eventSlug || trade.slug || slugifyText(marketTitle),
    market: marketTitle,
    outcome: trade.outcome || trade.side || "N/A",
    price: Number(price.toFixed(4)),
    side: `${trade.side || "BUY"}`.toUpperCase(),
    size: Number(size.toFixed(4)),
    sizeUsd: Number(sizeUsd.toFixed(2)),
    slug: trade.slug || trade.eventSlug || slugifyText(marketTitle),
    timestampMs,
    title: marketTitle,
    transactionHash: trade.transactionHash || trade.txHash || "",
  };
}

function normalizePriceHistory(payload) {
  const rawHistory = Array.isArray(payload?.history) ? payload.history : [];
  return rawHistory
    .map((point) => ({
      price: Number(asNumber(point.p || point.price).toFixed(4)),
      timestampMs: toTimestampMs(point.t || point.timestamp),
    }))
    .filter((point) => point.timestampMs > 0 && point.price > 0)
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

function buildRecentSignal(activity, trades) {
  const latest = activity[0];
  if (latest) {
    const size = asNumber(latest.usdcSize);
    return {
      market: latest.title || latest.slug || "Unknown market",
      side: latest.outcome || latest.side || "N/A",
      action: latest.side === "SELL" ? "Position reduction" : "New entry",
      conviction: size >= 5000 ? "High" : size >= 1000 ? "Medium" : "Low",
    };
  }

  const latestTrade = trades[0];
  if (latestTrade) {
    return {
      market: latestTrade.market,
      side: latestTrade.outcome || latestTrade.side || "N/A",
      action: latestTrade.side === "SELL" ? "Position reduction" : "New entry",
      conviction: latestTrade.sizeUsd >= 5000 ? "High" : latestTrade.sizeUsd >= 1000 ? "Medium" : "Low",
    };
  }

  return {
    market: "No recent activity",
    side: "N/A",
    action: "Monitoring",
    conviction: "Low",
  };
}

function buildFocus(positions, closedPositions, activity, trades) {
  const candidateTexts = [
    ...positions.map((item) => `${item.title || ""} ${item.slug || ""}`),
    ...closedPositions.slice(0, 30).map((item) => `${item.title || ""} ${item.slug || ""}`),
    ...activity.slice(0, 20).map((item) => `${item.title || ""} ${item.slug || ""}`),
    ...trades.slice(0, 30).map((item) => `${item.title || item.market || ""} ${item.slug || ""}`),
  ];

  return pickTopCategories(candidateTexts, 3);
}

function buildSignalEntry(traderIdentity, activityItem, nowMs) {
  const timestampMs = toTimestampMs(activityItem.timestamp);
  const marketTitle = activityItem.title || activityItem.slug || "Unknown market";
  const sizeUsd = asNumber(activityItem.usdcSize);
  const conviction = sizeUsd >= 5000 ? "High" : sizeUsd >= 1000 ? "Medium" : "Low";

  return {
    traderId: traderIdentity.id,
    traderAlias: traderIdentity.alias,
    wallet: traderIdentity.wallet.toLowerCase(),
    timestamp: formatRelativeTimestamp(timestampMs, nowMs),
    timestampMs,
    market: marketTitle,
    marketTitle,
    marketSlug: activityItem.slug || activityItem.eventSlug || slugifyText(marketTitle),
    eventSlug: activityItem.eventSlug || activityItem.slug || slugifyText(marketTitle),
    action: activityItem.side === "SELL" ? "Position reduction" : "New entry",
    side: activityItem.outcome || activityItem.side || "N/A",
    size: `$${Math.round(sizeUsd).toLocaleString("en-US")}`,
    sizeUsd: Number(sizeUsd.toFixed(2)),
    note:
      activityItem.side === "SELL"
        ? "A recent position reduction was detected."
        : "A recent new entry or size increase was detected.",
    transactionHash: activityItem.transactionHash || "",
    outcome: activityItem.outcome || "",
    conviction,
    asset: activityItem.asset || "",
    price: Number(asNumber(activityItem.price).toFixed(4)),
  };
}

function computeReturnSeries(closedPositions) {
  return closedPositions
    .map((position) => {
      const totalBought = asNumber(position.totalBought);
      if (totalBought <= 0) {
        return 0;
      }
      return asNumber(position.realizedPnl) / totalBought;
    })
    .filter((value) => Number.isFinite(value));
}

function computeStandardDeviation(values) {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function buildAssetPriceMap(positions, trades) {
  const assetPriceMap = {};

  for (const trade of trades) {
    if (trade.asset && !assetPriceMap[trade.asset] && trade.price > 0) {
      assetPriceMap[trade.asset] = trade.price;
    }
  }

  for (const position of positions) {
    const asset = `${position.asset || ""}`;
    if (!asset || assetPriceMap[asset]) {
      continue;
    }

    const currentPrice = asNumber(position.curPrice || position.currentPrice || position.price || position.avgPrice);
    if (currentPrice > 0) {
      assetPriceMap[asset] = Number(clamp(currentPrice, 0.001, 0.999).toFixed(4));
    }
  }

  return assetPriceMap;
}

export function buildTraderFromPolymarket(candidate, payload, nowMs = Date.now()) {
  const positions = [...(payload.positions || [])].sort(
    (left, right) => asNumber(right.currentValue) - asNumber(left.currentValue)
  );
  const closedPositions = [...(payload.closedPositions || [])].sort(
    (left, right) => toTimestampMs(right.timestamp || right.endDate) - toTimestampMs(left.timestamp || left.endDate)
  );
  const activity = [...(payload.activity || [])].sort(
    (left, right) => toTimestampMs(right.timestamp) - toTimestampMs(left.timestamp)
  );
  const recentTrades = [...(payload.trades || [])]
    .map(normalizeTradeEntry)
    .filter((trade) => trade.timestampMs > 0)
    .sort((left, right) => right.timestampMs - left.timestampMs);
  const value = asNumber(payload.value?.[0]?.value);

  const closed90d = closedPositions.filter((item) => isWithinDays(item.timestamp || item.endDate, 90, nowMs));
  const closed30d = closedPositions.filter((item) => isWithinDays(item.timestamp || item.endDate, 30, nowMs));
  const activity30d = activity.filter((item) => isWithinDays(item.timestamp, 30, nowMs));
  const activity7d = activity.filter((item) => isWithinDays(item.timestamp, 7, nowMs));

  const wins90d = closed90d.filter((item) => asNumber(item.realizedPnl) > 0);
  const wins30d = closed30d.filter((item) => asNumber(item.realizedPnl) > 0);

  const totalBought90d = closed90d.reduce((sum, item) => sum + asNumber(item.totalBought), 0);
  const totalBoughtWins90d = wins90d.reduce((sum, item) => sum + asNumber(item.totalBought), 0);
  const realizedPnl90d = closed90d.reduce((sum, item) => sum + asNumber(item.realizedPnl), 0);

  const forecastAccuracy90d = closed90d.length ? (wins90d.length / closed90d.length) * 100 : 0;
  const forecastAccuracy30d = closed30d.length ? (wins30d.length / closed30d.length) * 100 : forecastAccuracy90d;
  const amountWeightedAccuracy90d = totalBought90d ? (totalBoughtWins90d / totalBought90d) * 100 : 0;
  const realizedRoi90d = totalBought90d ? (realizedPnl90d / totalBought90d) * 100 : 0;
  const settledMarkets90d = uniqueCount(closed90d, (item) => item.conditionId || item.slug || item.title);
  const activeDays30d = uniqueDayCount(activity30d, (item) => item.timestamp);
  const activeDays7d = uniqueDayCount(activity7d, (item) => item.timestamp);
  const focus = buildFocus(positions, closedPositions, activity, recentTrades);
  const trackedCategories = focus.length || 1;

  const winningEdgeSamples = wins90d.map((item) => (1 - clamp(asNumber(item.avgPrice), 0, 1)) * 10000);
  const avgEntryEdgeBps = winningEdgeSamples.length
    ? winningEdgeSamples.reduce((sum, value) => sum + value, 0) / winningEdgeSamples.length
    : closed90d.length
      ? closed90d.reduce((sum, item) => sum + (1 - clamp(asNumber(item.avgPrice), 0, 1)) * 10000, 0) / closed90d.length
      : 0;

  const recencyConsistency = clamp((activeDays30d / 20) * 70 + (activeDays7d / 5) * 30, 0, 100);
  const recentBuySizes = activity.slice(0, 12).map((item) => asNumber(item.usdcSize)).filter((value) => value > 0);
  const latencySensitivity = clamp(0.008 + (median(recentBuySizes) / 50000) * 0.012, 0.008, 0.025);
  const returnSeries = computeReturnSeries(closed90d);
  const volatility = computeStandardDeviation(returnSeries);
  const copySharpe = clamp(realizedRoi90d / Math.max(volatility * 100, 8), 0.2, 3);

  const latestIdentity = activity[0] || candidate;
  const alias =
    candidate.userName || latestIdentity.name || latestIdentity.pseudonym || shortWallet(candidate.proxyWallet);
  const traderIdentity = {
    id: candidate.proxyWallet.toLowerCase(),
    alias,
    wallet: candidate.proxyWallet,
  };
  const trader = {
    id: traderIdentity.id,
    alias,
    wallet: candidate.proxyWallet,
    platform: "Polymarket",
    profileImage: latestIdentity.profileImageOptimized || latestIdentity.profileImage || candidate.profileImage || "",
    focus,
    forecastAccuracy30d: Number(forecastAccuracy30d.toFixed(1)),
    forecastAccuracy90d: Number(forecastAccuracy90d.toFixed(1)),
    amountWeightedAccuracy90d: Number(amountWeightedAccuracy90d.toFixed(1)),
    realizedRoi90d: Number(realizedRoi90d.toFixed(1)),
    settledMarkets90d,
    activeDays30d,
    trackedCategories,
    recencyConsistency: Number(recencyConsistency.toFixed(1)),
    avgEntryEdgeBps: Number(avgEntryEdgeBps.toFixed(0)),
    openPositions: positions.length,
    openExposure: Number((value || positions.reduce((sum, item) => sum + asNumber(item.currentValue), 0)).toFixed(2)),
    latencySensitivity: Number(latencySensitivity.toFixed(4)),
    copySharpe: Number(copySharpe.toFixed(2)),
    recentSignal: buildRecentSignal(activity, recentTrades),
    recentActivities: activity.slice(0, 5).map((item) => buildSignalEntry(traderIdentity, item, nowMs)),
    recentTrades,
    assetPriceMap: buildAssetPriceMap(positions, recentTrades),
  };

  return {
    ...trader,
    backtestSummary: buildBacktestSummary(trader),
  };
}

function deduplicateCandidates(entries) {
  const byWallet = new Map();

  for (const entry of entries) {
    const wallet = entry.proxyWallet?.toLowerCase();
    if (!wallet) {
      continue;
    }

    if (!byWallet.has(wallet)) {
      byWallet.set(wallet, entry);
    }
  }

  return [...byWallet.values()];
}

async function hydrateCandidate(candidate) {
  const [positions, closedPositions, activity, value, trades] = await Promise.all([
    fetchUserPositions(candidate.proxyWallet, { limit: 25 }),
    fetchClosedPositions(candidate.proxyWallet, { limit: 150 }),
    fetchUserActivity(candidate.proxyWallet, { limit: 25 }),
    fetchUserValue(candidate.proxyWallet),
    fetchUserTrades(candidate.proxyWallet, { limit: 80, takerOnly: true }),
  ]);

  return {
    positions,
    closedPositions,
    activity,
    value,
    trades,
  };
}

async function buildMarketContexts(traders, { limit = 12 } = {}) {
  const buckets = new Map();
  const prioritySlugs = new Set();

  function registerMarketPoint({ slug, title, asset, sizeUsd, timestampMs, price, traderId }) {
    if (!slug || !asset) {
      return;
    }

    if (!buckets.has(slug)) {
      buckets.set(slug, {
        slug,
        title,
        totalSizeUsd: 0,
        latestTimestampMs: 0,
        traders: new Set(),
        assetScores: new Map(),
      });
    }

    const bucket = buckets.get(slug);
    bucket.title = title || bucket.title;
    bucket.totalSizeUsd += sizeUsd;
    bucket.latestTimestampMs = Math.max(bucket.latestTimestampMs, timestampMs || 0);
    bucket.traders.add(traderId);

    const assetScore = bucket.assetScores.get(asset) || {
      asset,
      totalSizeUsd: 0,
      count: 0,
      latestTimestampMs: 0,
      latestPrice: price,
    };
    assetScore.totalSizeUsd += sizeUsd;
    assetScore.count += 1;
    assetScore.latestTimestampMs = Math.max(assetScore.latestTimestampMs, timestampMs || 0);
    assetScore.latestPrice = price || assetScore.latestPrice;
    bucket.assetScores.set(asset, assetScore);
  }

  for (const trader of traders) {
    for (const activity of trader.recentActivities || []) {
      const activitySlug = activity.marketSlug || slugifyText(activity.market);
      prioritySlugs.add(activitySlug);
      registerMarketPoint({
        slug: activitySlug,
        title: activity.marketTitle || activity.market,
        asset: activity.asset,
        sizeUsd: asNumber(activity.sizeUsd),
        timestampMs: activity.timestampMs,
        price: asNumber(activity.price),
        traderId: trader.id,
      });
    }

    for (const trade of trader.recentTrades || []) {
      registerMarketPoint({
        slug: trade.slug,
        title: trade.market,
        asset: trade.asset,
        sizeUsd: trade.sizeUsd,
        timestampMs: trade.timestampMs,
        price: trade.price,
        traderId: trader.id,
      });
    }
  }

  const selected = [...buckets.values()]
    .filter((bucket) => bucket.assetScores.size > 0)
    .sort((left, right) => {
      const leftPriority = prioritySlugs.has(left.slug) ? 1 : 0;
      const rightPriority = prioritySlugs.has(right.slug) ? 1 : 0;
      if (rightPriority !== leftPriority) {
        return rightPriority - leftPriority;
      }
      if (right.traders.size !== left.traders.size) {
        return right.traders.size - left.traders.size;
      }
      if (right.totalSizeUsd !== left.totalSizeUsd) {
        return right.totalSizeUsd - left.totalSizeUsd;
      }
      return right.latestTimestampMs - left.latestTimestampMs;
    })
    .slice(0, Math.max(limit, prioritySlugs.size));

  return Promise.all(
    selected.map(async (bucket) => {
      const primaryAsset = [...bucket.assetScores.values()].sort((left, right) => {
        if (right.totalSizeUsd !== left.totalSizeUsd) {
          return right.totalSizeUsd - left.totalSizeUsd;
        }
        return right.latestTimestampMs - left.latestTimestampMs;
      })[0];

      if (!primaryAsset) {
        return {
          slug: bucket.slug,
          title: bucket.title,
          asset: "",
          currentPrice: 0,
          priceChangePct: 0,
          priceHistory: [],
          sampledAt: new Date().toISOString(),
        };
      }

      try {
        const historyPayload = await fetchPricesHistory(primaryAsset.asset, { interval: "1w", fidelity: 60 });
        const priceHistory = normalizePriceHistory(historyPayload);
        const firstPoint = priceHistory[0];
        const lastPoint = priceHistory[priceHistory.length - 1];
        const currentPrice = lastPoint?.price || primaryAsset.latestPrice || 0;
        const priceChangePct = firstPoint?.price
          ? Number((((currentPrice - firstPoint.price) / firstPoint.price) * 100).toFixed(1))
          : 0;

        return {
          slug: bucket.slug,
          title: bucket.title,
          asset: primaryAsset.asset,
          currentPrice: Number(currentPrice.toFixed(4)),
          priceChangePct,
          priceHistory,
          sampledAt: new Date().toISOString(),
        };
      } catch (error) {
        console.warn(`Failed to fetch price history for ${bucket.slug}: ${error.message}`);
        return {
          slug: bucket.slug,
          title: bucket.title,
          asset: primaryAsset.asset,
          currentPrice: Number((primaryAsset.latestPrice || 0).toFixed(4)),
          priceChangePct: 0,
          priceHistory: [],
          sampledAt: new Date().toISOString(),
        };
      }
    })
  );
}

export async function buildPolymarketSnapshot(options = {}) {
  const nowMs = options.nowMs || Date.now();
  const candidateLimitPerPeriod = options.candidateLimitPerPeriod || 6;
  const maxTraders = options.maxTraders || 12;
  const periods = ["DAY", "WEEK", "MONTH"];

  const leaderboards = await Promise.all(
    periods.map((timePeriod) => fetchLeaderboard({ timePeriod, orderBy: "PNL", limit: candidateLimitPerPeriod }))
  );

  const candidates = deduplicateCandidates(leaderboards.flat()).slice(0, maxTraders);
  const hydrated = [];

  for (const candidate of candidates) {
    try {
      const payload = await hydrateCandidate(candidate);
      hydrated.push(buildTraderFromPolymarket(candidate, payload, nowMs));
    } catch (error) {
      console.warn(`Failed to hydrate ${candidate.proxyWallet}: ${error.message}`);
    }
  }

  const filteredTraders = hydrated
    .filter((trader) => trader.settledMarkets90d >= 5 || trader.activeDays30d >= 5)
    .sort((left, right) => right.forecastAccuracy90d - left.forecastAccuracy90d)
    .slice(0, maxTraders);

  const marketContexts = await buildMarketContexts(filteredTraders, { limit: Math.min(12, maxTraders) });
  const marketPriceMap = new Map(
    marketContexts.filter((context) => context.asset && context.currentPrice > 0).map((context) => [context.asset, context.currentPrice])
  );

  const enrichedTraders = filteredTraders.map((trader) => {
    const assetPriceMap = { ...(trader.assetPriceMap || {}) };
    for (const trade of trader.recentTrades || []) {
      if (trade.asset && marketPriceMap.has(trade.asset)) {
        assetPriceMap[trade.asset] = marketPriceMap.get(trade.asset);
      }
    }

    const enriched = {
      ...trader,
      assetPriceMap,
    };

    return {
      ...enriched,
      backtestSummary: buildBacktestSummary(enriched),
    };
  });

  const signalFeed = enrichedTraders
    .flatMap((trader) => trader.recentActivities)
    .sort((left, right) => right.timestampMs - left.timestampMs)
    .slice(0, 12);

  return normalizeSnapshot({
    generatedAt: new Date(nowMs).toISOString(),
    source: "live",
    platform: "Polymarket",
    notes: [
      "Built from the official Polymarket leaderboard, positions, closed-positions, activity, trades, value, and prices-history endpoints.",
      "Forecast accuracy is proxied from realized PnL on closed positions over the last 90 days, and copy performance is reconstructed from recent live trades.",
    ],
    traders: enrichedTraders,
    signalFeed,
    marketThemes: buildMarketThemesFromSignals(signalFeed, enrichedTraders),
    marketContexts,
  });
}

export async function writeSnapshot(snapshot) {
  await mkdir(dirname(snapshotFilePath), { recursive: true });
  await writeFile(snapshotFilePath, JSON.stringify(snapshot, null, 2), "utf8");
  return snapshot;
}

export async function readSnapshot() {
  if (!existsSync(snapshotFilePath)) {
    return createFallbackSnapshot();
  }

  try {
    const content = await readFile(snapshotFilePath, "utf8");
    return normalizeSnapshot(JSON.parse(content));
  } catch {
    return createFallbackSnapshot();
  }
}

export async function syncPolymarketSnapshot(options = {}) {
  const snapshot = await buildPolymarketSnapshot(options);
  return writeSnapshot(snapshot);
}




