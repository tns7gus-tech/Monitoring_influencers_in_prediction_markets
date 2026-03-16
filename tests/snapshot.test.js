import test from "node:test";
import assert from "node:assert/strict";

import { createFallbackSnapshot, normalizeSnapshot } from "../src/snapshot.js";

test("createFallbackSnapshot returns a normalized demo dataset", () => {
  const snapshot = createFallbackSnapshot();

  assert.equal(snapshot.source, "fallback");
  assert.ok(snapshot.traders.length > 0);
  assert.ok(snapshot.signalFeed.length > 0);
});

test("normalizeSnapshot backfills market themes when omitted", () => {
  const snapshot = normalizeSnapshot({
    generatedAt: "2026-03-14T00:00:00.000Z",
    source: "live",
    traders: [
      {
        id: "a",
        alias: "Trader A",
        wallet: "0x0000000000000000000000000000000000000001",
        focus: ["Macro"],
        recentSignal: { market: "Fed cuts", side: "YES", action: "New entry", conviction: "High" },
      },
    ],
    signalFeed: [
      {
        traderId: "a",
        timestamp: "5m ago",
        market: "Fed cuts",
        action: "New entry",
        side: "YES",
        size: "$100",
        note: "",
      },
    ],
  });

  assert.equal(snapshot.marketThemes.length, 1);
  assert.equal(snapshot.marketThemes[0].category, "Macro");
});
