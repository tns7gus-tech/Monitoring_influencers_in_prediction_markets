import test from "node:test";
import assert from "node:assert/strict";

import { buildBacktestSummary, simulateHistoricalCopyFromTrader } from "../src/backtest.js";

const trader = {
  id: "0x1111111111111111111111111111111111111111",
  alias: "Backtest Trader",
  latencySensitivity: 0.01,
  recentTrades: [
    {
      market: "Fed cuts in June",
      slug: "fed-cuts-in-june",
      asset: "asset-fed-yes",
      side: "BUY",
      outcome: "YES",
      size: 100,
      sizeUsd: 420,
      price: 0.42,
      timestampMs: Date.parse("2026-03-01T10:00:00.000Z"),
    },
    {
      market: "Fed cuts in June",
      slug: "fed-cuts-in-june",
      asset: "asset-fed-yes",
      side: "SELL",
      outcome: "YES",
      size: 100,
      sizeUsd: 660,
      price: 0.66,
      timestampMs: Date.parse("2026-03-02T10:00:00.000Z"),
    },
    {
      market: "Bitcoin above 120k",
      slug: "bitcoin-120k",
      asset: "asset-btc-yes",
      side: "BUY",
      outcome: "YES",
      size: 100,
      sizeUsd: 480,
      price: 0.48,
      timestampMs: Date.parse("2026-03-10T10:00:00.000Z"),
    },
  ],
  assetPriceMap: {
    "asset-btc-yes": 0.57,
  },
};

test("simulateHistoricalCopyFromTrader uses paired exits and observed prices", () => {
  const result = simulateHistoricalCopyFromTrader(trader, {
    budget: 1000,
    latencyMinutes: 5,
    mode: "follow_exit",
    minTradeUsd: 100,
  });

  assert.equal(result.eventCount, 2);
  assert.ok(result.netPnl > 0);
  assert.ok(result.roi > 0);
  assert.ok(result.curve.length >= 2);
  assert.equal(result.availableRange.startDate, "2026-03-01");
  assert.equal(result.availableRange.endDate, "2026-03-10");
});

test("simulateHistoricalCopyFromTrader respects date windows for entry selection", () => {
  const result = simulateHistoricalCopyFromTrader(trader, {
    budget: 1000,
    latencyMinutes: 5,
    mode: "follow_exit",
    minTradeUsd: 100,
    startDate: "2026-03-05",
    endDate: "2026-03-12",
  });

  assert.equal(result.eventCount, 1);
  assert.equal(result.startDate, "2026-03-05");
  assert.equal(result.endDate, "2026-03-12");
  assert.equal(result.events[0].slug, "bitcoin-120k");
});

test("buildBacktestSummary returns ranked scenarios", () => {
  const summary = buildBacktestSummary(trader);

  assert.equal(summary.scenarios.length, 4);
  assert.ok(summary.bestScenario);
  assert.ok(summary.eventCoverage >= 1);
});
