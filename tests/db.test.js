import test from "node:test";
import assert from "node:assert/strict";

import { createAppDatabase } from "../src/db.js";
import { createFallbackSnapshot, normalizeSnapshot } from "../src/snapshot.js";

function buildTrackedSnapshot(nowMs) {
  const wallet = "0x1111111111111111111111111111111111111111";
  return normalizeSnapshot({
    generatedAt: new Date(nowMs).toISOString(),
    source: "live",
    traders: [
      {
        id: wallet,
        alias: "Tracked Wallet",
        wallet,
        platform: "Polymarket",
        focus: ["Macro"],
        forecastAccuracy30d: 72,
        forecastAccuracy90d: 74,
        amountWeightedAccuracy90d: 78,
        realizedRoi90d: 12,
        settledMarkets90d: 20,
        activeDays30d: 12,
        trackedCategories: 1,
        recencyConsistency: 80,
        avgEntryEdgeBps: 88,
        openPositions: 2,
        openExposure: 2500,
        latencySensitivity: 0.012,
        copySharpe: 1.2,
        recentSignal: {
          market: "Fed cuts in June",
          side: "YES",
          action: "New entry",
          conviction: "High",
        },
        recentActivities: [
          {
            traderId: wallet,
            traderAlias: "Tracked Wallet",
            wallet,
            market: "Fed cuts in June",
            marketTitle: "Fed cuts in June",
            marketSlug: "fed-cuts-in-june",
            action: "New entry",
            side: "YES",
            size: "$2,400",
            sizeUsd: 2400,
            note: "Recent entry",
            timestamp: "1m ago",
            timestampMs: nowMs,
            transactionHash: "0xdef",
            conviction: "Medium",
          },
        ],
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
            transactionHash: "0xtrade1",
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
            transactionHash: "0xtrade2",
          },
        ],
        assetPriceMap: {
          "asset-fed-yes": 0.66,
        },
      },
    ],
    signalFeed: [
      {
        traderId: wallet,
        traderAlias: "Tracked Wallet",
        wallet,
        market: "Fed cuts in June",
        marketTitle: "Fed cuts in June",
        marketSlug: "fed-cuts-in-june",
        action: "New entry",
        side: "YES",
        size: "$2,400",
        sizeUsd: 2400,
        note: "Recent entry",
        timestamp: "1m ago",
        timestampMs: nowMs,
        transactionHash: "0xdef",
        conviction: "Medium",
      },
    ],
    marketContexts: [
      {
        slug: "fed-cuts-in-june",
        title: "Fed cuts in June",
        asset: "asset-fed-yes",
        currentPrice: 0.66,
        priceChangePct: 57.1,
        sampledAt: new Date(nowMs).toISOString(),
        priceHistory: [
          { timestampMs: nowMs - 86400000, price: 0.42 },
          { timestampMs: nowMs, price: 0.66 },
        ],
      },
    ],
  });
}

function createUser(database, displayName, username) {
  const result = database.registerUser({
    displayName,
    username,
    password: "password123",
  });
  return {
    userId: result.session.user.id,
    sessionToken: result.sessionToken,
    username,
  };
}

test("database saves snapshot and returns market summaries", () => {
  const database = createAppDatabase(":memory:");
  const snapshot = createFallbackSnapshot();
  const nowMs = Date.now();
  const trader = snapshot.traders[0];

  trader.recentActivities = [
    {
      traderId: trader.id,
      traderAlias: trader.alias,
      wallet: trader.wallet,
      market: "Fed cuts in June",
      marketTitle: "Fed cuts in June",
      marketSlug: "fed-cuts-in-june",
      action: "New entry",
      side: "YES",
      size: "$1,000",
      sizeUsd: 1000,
      note: "Macro event entry",
      timestamp: "5m ago",
      timestampMs: nowMs,
      transactionHash: "0xabc",
      conviction: "Medium",
    },
  ];
  snapshot.signalFeed = [...trader.recentActivities];
  snapshot.marketContexts = [
    {
      slug: "fed-cuts-in-june",
      title: "Fed cuts in June",
      asset: "asset-fed-yes",
      currentPrice: 0.61,
      priceChangePct: 11.2,
      sampledAt: new Date(nowMs).toISOString(),
      priceHistory: [
        { timestampMs: nowMs - 600000, price: 0.55 },
        { timestampMs: nowMs, price: 0.61 },
      ],
    },
  ];

  database.saveSnapshot(snapshot);
  const persisted = database.getSnapshot();
  const markets = database.listMarketSummaries(10);

  assert.equal(persisted.traders.length, snapshot.traders.length);
  assert.equal(markets[0].slug, "fed-cuts-in-june");
  assert.equal(markets[0].currentPrice, 0.61);

  database.close();
});

test("database scopes users, sessions, and watchlist alerts", () => {
  const database = createAppDatabase(":memory:");
  const snapshot = buildTrackedSnapshot(Date.now());
  const alice = createUser(database, "Alice", "alice");
  const bob = createUser(database, "Bob", "bob");

  database.saveSnapshot(snapshot);
  database.upsertWatchlist(alice.userId, {
    label: "Macro Watch",
    wallet: snapshot.traders[0].wallet,
    thesis: "Track macro entries from this wallet.",
    prefs: { minSizeUsd: 1000, minForecastScore: 0, alertMode: "all" },
  });
  database.upsertWatchlist(bob.userId, {
    label: "Strict Watch",
    wallet: snapshot.traders[0].wallet,
    thesis: "Only care about very large high conviction entries.",
    prefs: { minSizeUsd: 5000, minForecastScore: 0, alertMode: "high_conviction" },
  });

  const inserted = database.generateAlerts(snapshot, { userIds: [alice.userId, bob.userId], includePublic: false });
  const aliceAlerts = database.listAlerts(alice.userId, 10);
  const bobAlerts = database.listAlerts(bob.userId, 10);
  const aliceSession = database.getSessionByToken(alice.sessionToken);
  const bobLogin = database.loginUser({ username: bob.username, password: "password123" });

  assert.ok(inserted >= 1);
  assert.equal(database.listWatchlist(alice.userId).length, 1);
  assert.equal(database.listWatchlist(bob.userId).length, 1);
  assert.ok(aliceAlerts.some((alert) => alert.type === "watchlist_activity"));
  assert.equal(bobAlerts.filter((alert) => alert.type === "watchlist_activity").length, 0);
  assert.equal(aliceSession.user.username, "alice");
  assert.equal(database.getSessionByToken(bobLogin.sessionToken).user.username, "bob");

  database.close();
});

test("database applies watchlist category, side, recency, and entry filters", () => {
  const database = createAppDatabase(":memory:");
  const nowMs = Date.now();
  const snapshot = buildTrackedSnapshot(nowMs);
  const user = createUser(database, "Filter User", "filter-user");
  const trader = snapshot.traders[0];

  trader.recentActivities = [
    {
      traderId: trader.id,
      traderAlias: trader.alias,
      wallet: trader.wallet,
      market: "Fed cuts in June",
      marketTitle: "Fed cuts in June",
      marketSlug: "fed-cuts-in-june",
      action: "New entry",
      side: "YES",
      size: "$2,400",
      sizeUsd: 2400,
      note: "Recent macro entry",
      timestamp: "1m ago",
      timestampMs: nowMs,
      transactionHash: "0xmacro-yes",
      conviction: "Medium",
    },
    {
      traderId: trader.id,
      traderAlias: trader.alias,
      wallet: trader.wallet,
      market: "Bitcoin above 100k",
      marketTitle: "Bitcoin above 100k",
      marketSlug: "bitcoin-above-100k",
      action: "New entry",
      side: "NO",
      size: "$2,400",
      sizeUsd: 2400,
      note: "Crypto fade",
      timestamp: "5m ago",
      timestampMs: nowMs - 5 * 60 * 1000,
      transactionHash: "0xcrypto-no",
      conviction: "Medium",
    },
    {
      traderId: trader.id,
      traderAlias: trader.alias,
      wallet: trader.wallet,
      market: "Fed cuts in June",
      marketTitle: "Fed cuts in June",
      marketSlug: "fed-cuts-in-june",
      action: "Position reduction",
      side: "YES",
      size: "$2,800",
      sizeUsd: 2800,
      note: "Trimmed exposure",
      timestamp: "2h ago",
      timestampMs: nowMs - 2 * 60 * 60 * 1000,
      transactionHash: "0xmacro-reduce",
      conviction: "Medium",
    },
    {
      traderId: trader.id,
      traderAlias: trader.alias,
      wallet: trader.wallet,
      market: "Fed cuts in June",
      marketTitle: "Fed cuts in June",
      marketSlug: "fed-cuts-in-june",
      action: "New entry",
      side: "YES",
      size: "$2,600",
      sizeUsd: 2600,
      note: "Older macro entry",
      timestamp: "30h ago",
      timestampMs: nowMs - 30 * 60 * 60 * 1000,
      transactionHash: "0xmacro-old",
      conviction: "Medium",
    },
  ];
  snapshot.signalFeed = [...trader.recentActivities];

  database.saveSnapshot(snapshot);
  database.upsertWatchlist(user.userId, {
    label: "Macro YES Window",
    wallet: trader.wallet,
    thesis: "Only recent macro YES entries should create alerts.",
    prefs: {
      minSizeUsd: 1000,
      minForecastScore: 0,
      alertMode: "new_entries_only",
      marketCategory: "Macro",
      sideFilter: "yes_only",
      recentHours: 24,
    },
  });

  database.generateAlerts(snapshot, { userIds: [user.userId], includePublic: false });
  const watchAlerts = database
    .listAlerts(user.userId, 20)
    .filter((alert) => alert.type === "watchlist_activity");

  assert.equal(watchAlerts.length, 1);
  assert.equal(watchAlerts[0].marketSlug, "fed-cuts-in-june");
  assert.equal(watchAlerts[0].wallet, trader.wallet);

  database.close();
});

test("database stores backtests per user", () => {
  const database = createAppDatabase(":memory:");
  const snapshot = buildTrackedSnapshot(Date.now());
  const alice = createUser(database, "Alice", "alice-backtest");
  const bob = createUser(database, "Bob", "bob-backtest");

  database.saveSnapshot(snapshot);
  const stored = database.runBacktest(alice.userId, snapshot.traders[0].id, {
    budget: 1500,
    latencyMinutes: 15,
    mode: "follow_exit",
    minTradeUsd: 200,
    startDate: "2026-03-01",
    endDate: "2026-03-14",
  });

  assert.equal(database.listBacktestRuns(alice.userId, 5).length, 1);
  assert.equal(database.listBacktestRuns(bob.userId, 5).length, 0);
  assert.equal(database.getBacktestRun(alice.userId, stored.id).id, stored.id);
  assert.equal(database.getBacktestRun(bob.userId, stored.id), null);

  database.close();
});

test("database stores notification channels and deliveries per user", () => {
  const database = createAppDatabase(":memory:");
  const snapshot = buildTrackedSnapshot(Date.now());
  const alice = createUser(database, "Alice", "alice-ops");
  const bob = createUser(database, "Bob", "bob-ops");

  database.saveSnapshot(snapshot);
  const channel = database.upsertNotificationChannel(alice.userId, {
    label: "Ops Log",
    type: "log_only",
    enabled: true,
  });
  const delivery = database.createNotificationChannelTest(alice.userId, channel.id);

  assert.ok(channel.id >= 1);
  assert.equal(delivery.status, "queued");
  assert.equal(database.listNotificationChannels(bob.userId).length, 0);
  assert.equal(database.getNotificationDelivery(bob.userId, delivery.id), null);

  database.markNotificationDeliveryResult(delivery.id, { status: "sent", responseCode: 200 });
  assert.equal(database.getNotificationDelivery(alice.userId, delivery.id).status, "sent");
  assert.equal(database.getNotificationChannel(alice.userId, channel.id).lastStatus, "sent");

  database.close();
});
