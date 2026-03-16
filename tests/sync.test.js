import test from "node:test";
import assert from "node:assert/strict";

import { buildTraderFromPolymarket } from "../src/sync.js";

test("buildTraderFromPolymarket derives forecast metrics and trade-backed backtest summary", () => {
  const nowMs = Date.parse("2026-03-14T12:00:00.000Z");
  const trader = buildTraderFromPolymarket(
    {
      proxyWallet: "0x1111111111111111111111111111111111111111",
      userName: "alpha-wallet",
    },
    {
      positions: [
        {
          currentValue: 1800,
          title: "Fed cuts in June",
          slug: "fed-cuts-june",
          asset: "asset-fed-yes",
          currentPrice: 0.58,
        },
      ],
      closedPositions: [
        {
          conditionId: "m1",
          totalBought: 1000,
          realizedPnl: 300,
          avgPrice: 0.42,
          title: "Fed cuts in June",
          slug: "fed-cuts-june",
          timestamp: Math.floor(nowMs / 1000) - 86400,
        },
        {
          conditionId: "m2",
          totalBought: 1000,
          realizedPnl: -100,
          avgPrice: 0.61,
          title: "Bitcoin above 120k",
          slug: "bitcoin-120k",
          timestamp: Math.floor(nowMs / 1000) - 172800,
        },
      ],
      activity: [
        {
          timestamp: Math.floor(nowMs / 1000) - 3600,
          title: "Fed cuts in June",
          slug: "fed-cuts-june",
          outcome: "YES",
          side: "BUY",
          usdcSize: 2400,
          asset: "asset-fed-yes",
          transactionHash: "0xaaa",
        },
      ],
      trades: [
        {
          timestamp: nowMs - 7200000,
          title: "Fed cuts in June",
          slug: "fed-cuts-june",
          asset: "asset-fed-yes",
          side: "BUY",
          outcome: "YES",
          size: 100,
          price: 0.42,
          transactionHash: "0xaaa",
        },
        {
          timestamp: nowMs - 1800000,
          title: "Fed cuts in June",
          slug: "fed-cuts-june",
          asset: "asset-fed-yes",
          side: "SELL",
          outcome: "YES",
          size: 100,
          price: 0.66,
          transactionHash: "0xaab",
        },
      ],
      value: [{ value: 2500 }],
    },
    nowMs
  );

  assert.equal(trader.alias, "alpha-wallet");
  assert.equal(trader.forecastAccuracy90d, 50);
  assert.equal(trader.amountWeightedAccuracy90d, 50);
  assert.equal(trader.realizedRoi90d, 10);
  assert.equal(trader.recentSignal.action, "New entry");
  assert.equal(trader.recentActivities[0].conviction, "Medium");
  assert.equal(trader.recentTrades.length, 2);
  assert.ok(trader.assetPriceMap["asset-fed-yes"] > 0);
  assert.ok(trader.backtestSummary.bestScenario);
});
