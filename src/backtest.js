function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toTimestampMs(value, { endOfDay = false } = {}) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1e12 ? numeric : numeric * 1000;
  }

  const source = `${value}`.trim();
  if (!source) {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(source)
    ? `${source}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : source;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeTrade(trade) {
  const price = toNumber(trade.price);
  const size = toNumber(trade.size);
  return {
    ...trade,
    side: `${trade.side || "BUY"}`.toUpperCase(),
    price,
    size,
    sizeUsd: toNumber(trade.sizeUsd || size * price),
    timestampMs: toNumber(trade.timestampMs || trade.timestamp),
    asset: `${trade.asset || ""}`,
    market: trade.market || trade.title || "Unknown market",
    slug: trade.slug || trade.marketSlug || "unknown-market",
  };
}

function buildSellQueues(trades) {
  const queues = new Map();

  for (const trade of trades) {
    if (trade.side !== "SELL") {
      continue;
    }

    if (!queues.has(trade.asset)) {
      queues.set(trade.asset, []);
    }

    queues.get(trade.asset).push(trade);
  }

  return queues;
}

function findExitTrade(queue, timestampMs) {
  if (!queue?.length) {
    return null;
  }

  while (queue.length && queue[0].timestampMs <= timestampMs) {
    queue.shift();
  }

  return queue.length ? queue.shift() : null;
}

function computeEntryPenaltyRate(trader, trade, latencyMinutes) {
  const latencySensitivity = toNumber(trader.latencySensitivity || 0.012);
  const sizeFactor = clamp(trade.sizeUsd / 20000, 0, 1.4);
  const slippageRate = 0.003 + sizeFactor * 0.004;
  const latencyRate = Math.min(0.035, latencySensitivity * Math.sqrt(Math.max(latencyMinutes, 1)) * 0.45);
  return slippageRate + latencyRate;
}

function resolveObservedPrice(trader, trade) {
  const priceMap = trader.assetPriceMap || {};
  const assetPrice = toNumber(priceMap[trade.asset]);
  if (assetPrice > 0) {
    return assetPrice;
  }

  return clamp(trade.price, 0.001, 0.999);
}

function buildCurve(events, budget) {
  let equity = budget;
  let peak = budget;
  let maxDrawdown = 0;
  const curve = [];

  for (const event of events) {
    equity += event.netPnl;
    peak = Math.max(peak, equity);
    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
    }
    curve.push(Number(equity.toFixed(2)));
  }

  return {
    curve,
    maxDrawdown: Number(maxDrawdown.toFixed(1)),
  };
}

function buildAvailableRange(normalizedTrades) {
  if (!normalizedTrades.length) {
    return {
      startDate: null,
      endDate: null,
      startTimestampMs: null,
      endTimestampMs: null,
    };
  }

  const first = normalizedTrades[0].timestampMs;
  const last = normalizedTrades[normalizedTrades.length - 1].timestampMs;

  return {
    startDate: new Date(first).toISOString().slice(0, 10),
    endDate: new Date(last).toISOString().slice(0, 10),
    startTimestampMs: first,
    endTimestampMs: last,
  };
}

export function simulateHistoricalCopyFromTrader(trader, payload = {}) {
  const budget = Math.max(25, toNumber(payload.budget || 1000));
  const latencyMinutes = Math.max(1, toNumber(payload.latencyMinutes || 5));
  const mode = payload.mode === "hold_resolution" ? "hold_resolution" : "follow_exit";
  const minTradeUsd = Math.max(0, toNumber(payload.minTradeUsd || 0));
  const includeSellSignals = payload.includeSellSignals === true || payload.includeSellSignals === "true";
  const startDate = payload.startDate ? `${payload.startDate}`.slice(0, 10) : null;
  const endDate = payload.endDate ? `${payload.endDate}`.slice(0, 10) : null;
  const windowStartMs = toTimestampMs(startDate);
  const windowEndMs = toTimestampMs(endDate, { endOfDay: true });
  const rawTrades = Array.isArray(trader.recentTrades) ? trader.recentTrades : [];
  const normalizedTrades = rawTrades.map(normalizeTrade).sort((left, right) => left.timestampMs - right.timestampMs);
  const sellQueues = buildSellQueues(normalizedTrades);
  const feeRate = 0.0045;
  const availableRange = buildAvailableRange(normalizedTrades);
  const events = [];

  for (const trade of normalizedTrades) {
    if (trade.side !== "BUY" && !includeSellSignals) {
      continue;
    }

    if (windowStartMs !== null && trade.timestampMs < windowStartMs) {
      continue;
    }

    if (windowEndMs !== null && trade.timestampMs > windowEndMs) {
      continue;
    }

    if (trade.sizeUsd < minTradeUsd) {
      continue;
    }

    const penaltyRate = computeEntryPenaltyRate(trader, trade, latencyMinutes);
    const entryPrice = clamp(trade.price * (1 + penaltyRate), 0.001, 0.999);
    const pairedExit = mode === "follow_exit" ? findExitTrade(sellQueues.get(trade.asset), trade.timestampMs) : null;
    const baseExitPrice = pairedExit ? pairedExit.price : resolveObservedPrice(trader, trade);
    const exitPenalty = pairedExit ? Math.max(0.0015, penaltyRate * 0.55) : 0.0015;
    const exitPrice = clamp(baseExitPrice * (1 - exitPenalty), 0.0001, 1);
    const shares = budget / entryPrice;
    const grossValue = shares * exitPrice;
    const costs = budget * feeRate + budget * penaltyRate;
    const netPnl = grossValue - budget - costs;

    events.push({
      market: trade.market,
      slug: trade.slug,
      side: trade.outcome || trade.side,
      entryPrice: Number(entryPrice.toFixed(4)),
      exitPrice: Number(exitPrice.toFixed(4)),
      budget,
      netPnl: Number(netPnl.toFixed(2)),
      roi: Number(((netPnl / budget) * 100).toFixed(1)),
      timestampMs: trade.timestampMs,
      exitTimestampMs: pairedExit?.timestampMs || trade.timestampMs,
    });
  }

  if (!events.length) {
    return {
      traderId: trader.id,
      budget,
      latencyMinutes,
      mode,
      minTradeUsd,
      includeSellSignals,
      startDate,
      endDate,
      availableRange,
      eventCount: 0,
      netPnl: 0,
      roi: 0,
      winProbability: 0,
      maxDrawdown: 0,
      expectancy: 0,
      curve: [budget],
      events: [],
    };
  }

  const wins = events.filter((event) => event.netPnl > 0).length;
  const totalPnl = events.reduce((sum, event) => sum + event.netPnl, 0);
  const { curve, maxDrawdown } = buildCurve(events, budget);

  return {
    traderId: trader.id,
    budget,
    latencyMinutes,
    mode,
    minTradeUsd,
    includeSellSignals,
    startDate,
    endDate,
    availableRange,
    eventCount: events.length,
    netPnl: Number(totalPnl.toFixed(2)),
    roi: Number(((totalPnl / (budget * events.length)) * 100).toFixed(1)),
    winProbability: Number(((wins / events.length) * 100).toFixed(1)),
    maxDrawdown,
    expectancy: Number((totalPnl / events.length).toFixed(2)),
    curve,
    events,
  };
}

export function buildBacktestSummary(trader) {
  const scenarios = [
    { latencyMinutes: 1, mode: "follow_exit" },
    { latencyMinutes: 10, mode: "follow_exit" },
    { latencyMinutes: 60, mode: "follow_exit" },
    { latencyMinutes: 10, mode: "hold_resolution" },
  ].map((scenario) => simulateHistoricalCopyFromTrader(trader, { ...scenario, budget: 1000, minTradeUsd: 250 }));

  const recommended = [...scenarios].sort((left, right) => {
    if (right.roi !== left.roi) {
      return right.roi - left.roi;
    }
    return right.eventCount - left.eventCount;
  })[0];

  return {
    scenarios,
    recommendedLatencyMinutes: recommended?.latencyMinutes || 10,
    eventCoverage: Math.max(...scenarios.map((scenario) => scenario.eventCount), 0),
    bestScenario: recommended || null,
  };
}
