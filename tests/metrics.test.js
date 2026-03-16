import test from "node:test";
import assert from "node:assert/strict";

import { traders } from "../src/data.js";
import {
  calculateForecastScore,
  calculateReliabilityScore,
  rankTraders,
  simulateCopyStrategy,
  summarizeDashboard,
} from "../src/metrics.js";

test("forecast score rewards stronger accuracy while staying bounded", () => {
  const leader = calculateForecastScore(traders[0], 90);
  const tail = calculateForecastScore(traders.at(-1), 90);

  assert.ok(leader > tail);
  assert.ok(leader <= 100);
  assert.ok(tail >= 0);
});

test("reliability score increases with sample depth", () => {
  const leader = calculateReliabilityScore(traders[0]);
  const whale = calculateReliabilityScore(traders[4]);

  assert.ok(leader > whale);
});

test("ranking sorts traders in descending forecast score order", () => {
  const ranked = rankTraders(traders, 90);

  assert.equal(ranked[0].alias, "Atlas Flow");
  assert.ok(ranked[0].forecastScore >= ranked[1].forecastScore);
});

test("dashboard summary keeps accurate aggregate counts", () => {
  const summary = summarizeDashboard(traders, 30);

  assert.equal(summary.trackedTraders, traders.length);
  assert.equal(summary.leader.alias, "Atlas Flow");
  assert.ok(summary.openExposure > 0);
});

test("copy simulation penalizes slower entries", () => {
  const fast = simulateCopyStrategy(traders[0], {
    traderId: traders[0].id,
    latencyMinutes: 3,
    budget: 1000,
    mode: "follow_exit",
  });
  const slow = simulateCopyStrategy(traders[0], {
    traderId: traders[0].id,
    latencyMinutes: 40,
    budget: 1000,
    mode: "follow_exit",
  });

  assert.ok(fast.roi > slow.roi);
  assert.ok(fast.netPnl > slow.netPnl);
});
