import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { buildBacktestSummary, simulateHistoricalCopyFromTrader } from "./backtest.js";
import { inferCategoriesFromText } from "./categories.js";
import { translateLegacyCopy } from "./localization.js";
import {
  normalizeWatchPrefs,
  rankTraders,
  validateLoginInput,
  validateNotificationChannel,
  validateRegistrationInput,
  validateSimulationInput,
  validateWatchTarget,
} from "./metrics.js";
import { buildChannelTestAlert } from "./notifications.js";
import { createFallbackSnapshot, normalizeSnapshot } from "./snapshot.js";

export const defaultDatabasePath = resolve("data", "polymarket-monitor.db");

const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const idleChannelStatus = {
  lastStatus: "idle",
  lastError: "",
  lastAttemptAt: null,
  lastTestedAt: null,
};

function isoNow() {
  return new Date().toISOString();
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function slugifyText(value) {
  return `${value || ""}`
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown-market";
}

function toTimestampMs(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed > 1e12 ? parsed : parsed * 1000;
  }

  const fromDate = Date.parse(`${value || ""}`);
  return Number.isFinite(fromDate) ? fromDate : 0;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSizeUsd(signal) {
  if (Number.isFinite(Number(signal.sizeUsd))) {
    return Number(signal.sizeUsd);
  }

  const extracted = `${signal.size || ""}`.replace(/[^0-9.-]/g, "");
  return toNumber(extracted);
}

function buildSignalKey(signal) {
  return [
    signal.traderId || "unknown",
    signal.marketSlug || slugifyText(signal.marketTitle || signal.market),
    signal.transactionHash || signal.timestampMs || 0,
    signal.action || "signal",
  ].join(":");
}

function enrichSignal(signal, trader) {
  const localizedSignal = translateLegacyCopy(signal);
  const marketTitle = localizedSignal.marketTitle || localizedSignal.market || "Unknown market";
  const marketSlug = localizedSignal.marketSlug || slugifyText(marketTitle);
  const timestampMs = toTimestampMs(localizedSignal.timestampMs || localizedSignal.timestamp);
  const sizeUsd = parseSizeUsd(localizedSignal);

  return {
    id: buildSignalKey({
      ...localizedSignal,
      traderId: localizedSignal.traderId || trader?.id,
      marketSlug,
      timestampMs,
    }),
    traderId: localizedSignal.traderId || trader?.id || "unknown",
    traderAlias: localizedSignal.traderAlias || trader?.alias || "Unknown trader",
    wallet: `${localizedSignal.wallet || trader?.wallet || ""}`.toLowerCase(),
    market: marketTitle,
    marketTitle,
    marketSlug,
    eventSlug: localizedSignal.eventSlug || marketSlug,
    action: localizedSignal.action || "Monitoring",
    side: localizedSignal.side || "N/A",
    size: localizedSignal.size || `$${Math.round(sizeUsd).toLocaleString("en-US")}`,
    sizeUsd: Number(sizeUsd.toFixed(2)),
    note: localizedSignal.note || "No recent events.",
    timestamp: localizedSignal.timestamp || "Just now",
    timestampMs,
    transactionHash: localizedSignal.transactionHash || "",
    forecastScore: trader?.forecastScore || 0,
    forecastAccuracy90d: trader?.forecastAccuracy90d || 0,
    focus: trader?.focus || ["General"],
    conviction: localizedSignal.conviction || (sizeUsd >= 5000 ? "High" : sizeUsd >= 1000 ? "Medium" : "Low"),
    asset: localizedSignal.asset || "",
  };
}

function collectSignals(snapshot, rankedTraders) {
  const traderMap = new Map(rankedTraders.map((trader) => [trader.id, trader]));
  const signals = [];
  const seen = new Set();

  for (const trader of rankedTraders) {
    for (const activity of trader.recentActivities || []) {
      const normalized = enrichSignal(
        {
          ...activity,
          traderId: trader.id,
          traderAlias: trader.alias,
          wallet: trader.wallet,
        },
        trader
      );

      if (!seen.has(normalized.id)) {
        seen.add(normalized.id);
        signals.push(normalized);
      }
    }
  }

  for (const signal of snapshot.signalFeed || []) {
    const trader = traderMap.get(signal.traderId);
    const normalized = enrichSignal(signal, trader);

    if (!seen.has(normalized.id)) {
      seen.add(normalized.id);
      signals.push(normalized);
    }
  }

  return signals.sort((left, right) => right.timestampMs - left.timestampMs);
}

function buildMarketRecords(snapshot, rankedTraders = rankTraders(snapshot.traders || [], 90)) {
  const signals = collectSignals(snapshot, rankedTraders);
  const markets = new Map();
  const contextMap = new Map((snapshot.marketContexts || []).map((context) => [context.slug, context]));

  for (const signal of signals) {
    if (!markets.has(signal.marketSlug)) {
      markets.set(signal.marketSlug, {
        slug: signal.marketSlug,
        title: signal.marketTitle,
        latestTimestampMs: signal.timestampMs,
        latestTimestamp: signal.timestamp,
        signalCount: 0,
        traderCount: 0,
        totalSizeUsd: 0,
        categories: new Set(),
        traders: new Map(),
        recentSignals: [],
      });
    }

    const bucket = markets.get(signal.marketSlug);
    bucket.latestTimestampMs = Math.max(bucket.latestTimestampMs, signal.timestampMs);
    bucket.latestTimestamp = bucket.latestTimestampMs === signal.timestampMs ? signal.timestamp : bucket.latestTimestamp;
    bucket.signalCount += 1;
    bucket.totalSizeUsd += signal.sizeUsd;
    bucket.recentSignals.push(signal);

    const trader = rankedTraders.find((item) => item.id === signal.traderId);
    if (trader) {
      bucket.traders.set(trader.id, {
        id: trader.id,
        alias: trader.alias,
        wallet: trader.wallet,
        forecastScore: trader.forecastScore,
        forecastAccuracy90d: trader.forecastAccuracy90d,
        focus: trader.focus,
      });

      for (const category of trader.focus || ["General"]) {
        bucket.categories.add(category);
      }
    }
  }

  return [...markets.values()]
    .map((bucket) => {
      const yesCount = bucket.recentSignals.filter((signal) => /yes|buy/i.test(signal.side)).length;
      const noCount = bucket.recentSignals.filter((signal) => /no|sell/i.test(signal.side)).length;
      const consensusBias =
        yesCount > noCount
          ? "YES bias among tracked wallets"
          : noCount > yesCount
            ? "NO bias or defensive positioning"
            : "Mixed positioning";
      const context = contextMap.get(bucket.slug);

      return {
        slug: bucket.slug,
        title: context?.title || bucket.title,
        latestTimestampMs: bucket.latestTimestampMs,
        latestTimestamp: bucket.latestTimestamp,
        signalCount: bucket.signalCount,
        traderCount: bucket.traders.size,
        totalSizeUsd: Number(bucket.totalSizeUsd.toFixed(2)),
        categories: [...bucket.categories],
        consensusBias,
        topTraders: [...bucket.traders.values()].sort(
          (left, right) => right.forecastScore - left.forecastScore
        ),
        recentSignals: bucket.recentSignals.sort(
          (left, right) => right.timestampMs - left.timestampMs
        ),
        linkedAsset: context?.asset || "",
        currentPrice: Number((context?.currentPrice || 0).toFixed(4)),
        priceChangePct: Number((context?.priceChangePct || 0).toFixed(1)),
        priceHistory: Array.isArray(context?.priceHistory) ? context.priceHistory : [],
        sampledAt: context?.sampledAt || null,
      };
    })
    .sort((left, right) => right.latestTimestampMs - left.latestTimestampMs);
}

function isHighConvictionActivity(activity) {
  return activity.conviction === "High" || toNumber(activity.sizeUsd) >= 5000;
}

function isNewEntryActivity(activity) {
  const action = `${activity.action || ""}`.trim();
  if (/(reduce|reduction|trim|sell|exit|close|\uCD95\uC18C)/i.test(action)) {
    return false;
  }

  if (/(new entry|entry|buy|open|\uC9C4\uC785)/i.test(action)) {
    return true;
  }

  return !/^sell$/i.test(`${activity.side || ""}`.trim());
}

function matchesWatchCategory(activity, trader, marketCategory) {
  if (marketCategory === "all") {
    return true;
  }

  const categories = new Set([
    ...(Array.isArray(trader.focus) ? trader.focus : []),
    ...inferCategoriesFromText(`${activity.marketTitle || activity.market || ""} ${activity.note || ""}`),
  ]);

  return categories.has(marketCategory);
}

function matchesWatchSide(activity, sideFilter) {
  if (sideFilter === "all") {
    return true;
  }

  const normalizedSide = `${activity.outcome || activity.side || ""}`.trim().toLowerCase();
  if (sideFilter === "yes_only") {
    return normalizedSide.includes("yes") || normalizedSide === "buy";
  }

  if (sideFilter === "no_only") {
    return normalizedSide.includes("no") || normalizedSide === "sell";
  }

  return true;
}

function matchesWatchRecency(activity, recentHours) {
  if (!recentHours) {
    return true;
  }

  const timestampMs = toNumber(activity.timestampMs);
  if (!timestampMs) {
    return false;
  }

  return Date.now() - timestampMs <= recentHours * 60 * 60 * 1000;
}

function matchesWatchPrefs(activity, trader, prefs) {
  if (toNumber(activity.sizeUsd) < prefs.minSizeUsd) {
    return false;
  }

  if (toNumber(trader.forecastScore) < prefs.minForecastScore) {
    return false;
  }

  if (!matchesWatchCategory(activity, trader, prefs.marketCategory)) {
    return false;
  }

  if (!matchesWatchSide(activity, prefs.sideFilter)) {
    return false;
  }

  if (!matchesWatchRecency(activity, prefs.recentHours)) {
    return false;
  }

  if (prefs.alertMode === "high_conviction" && !isHighConvictionActivity(activity)) {
    return false;
  }

  if (prefs.alertMode === "new_entries_only" && !isNewEntryActivity(activity)) {
    return false;
  }

  return true;
}

function compactBacktestResult(result, includeEvents = false) {
  if (!result) {
    return null;
  }

  if (includeEvents) {
    return result;
  }

  const { events, ...rest } = result;
  return {
    ...rest,
    eventSampleCount: Array.isArray(events) ? events.length : 0,
  };
}

function serializeBacktestRunRow(row, { includeEvents = false } = {}) {
  if (!row) {
    return null;
  }

  const input = translateLegacyCopy(safeJsonParse(row.inputJson, {}));
  const result = translateLegacyCopy(safeJsonParse(row.resultJson, null));

  return {
    id: Number(row.id),
    runKey: row.runKey,
    traderId: row.traderId,
    traderAlias: row.traderAlias,
    forecastScore: toNumber(row.forecastScore),
    forecastAccuracy90d: toNumber(row.forecastAccuracy90d),
    snapshotGeneratedAt: row.snapshotGeneratedAt || null,
    createdAt: row.createdAt,
    input,
    result: compactBacktestResult(result, includeEvents),
  };
}

function buildDeliveryEnvelope(channel, alert, kind = "alert") {
  return {
    kind,
    alert,
    channelSnapshot: {
      label: channel.label,
      type: channel.type,
    },
  };
}

function serializeChannelRow(row) {
  if (!row) {
    return null;
  }

  const status = safeJsonParse(row.statusJson, {});
  return {
    id: Number(row.id),
    label: row.label,
    type: row.type,
    enabled: Boolean(row.enabled),
    config: safeJsonParse(row.configJson, {}),
    lastStatus: status.lastStatus || "idle",
    lastError: status.lastError || "",
    lastAttemptAt: status.lastAttemptAt || null,
    lastTestedAt: status.lastTestedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeDeliveryRow(row) {
  if (!row) {
    return null;
  }

  const envelope = safeJsonParse(row.deliveryJson, {});
  const alert = translateLegacyCopy(envelope.alert || {});
  const channelStatus = safeJsonParse(row.statusJson, {});

  return {
    id: Number(row.id),
    alertId: row.alertId ? Number(row.alertId) : null,
    channelId: Number(row.channelId),
    kind: row.kind,
    status: row.status,
    responseCode: row.responseCode === null || row.responseCode === undefined ? null : Number(row.responseCode),
    errorMessage: row.errorMessage || "",
    createdAt: row.createdAt,
    sentAt: row.sentAt || null,
    title: alert.title || `${row.channelLabel} notification`,
    message: alert.message || "",
    severity: alert.severity || "medium",
    alertType: alert.type || row.kind,
    marketSlug: alert.marketSlug || null,
    alert,
    channel: {
      id: Number(row.channelId),
      label: row.channelLabel,
      type: row.channelType,
      enabled: Boolean(row.channelEnabled),
      config: safeJsonParse(row.configJson, {}),
      lastStatus: channelStatus.lastStatus || "idle",
      lastError: channelStatus.lastError || "",
      lastAttemptAt: channelStatus.lastAttemptAt || null,
      lastTestedAt: channelStatus.lastTestedAt || null,
    },
  };
}

function serializeUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.userId || row.id,
    username: row.username,
    displayName: row.displayName,
    createdAt: row.userCreatedAt || row.createdAt,
    updatedAt: row.userUpdatedAt || row.updatedAt,
    lastLoginAt: row.lastLoginAt || null,
  };
}

function serializeSessionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.sessionId || row.id,
    createdAt: row.sessionCreatedAt || row.createdAt,
    updatedAt: row.sessionUpdatedAt || row.updatedAt,
    lastSeenAt: row.lastSeenAt || null,
    expiresAt: row.expiresAt || null,
    user: serializeUserRow(row),
  };
}

function hashPassword(password, passwordSalt = randomBytes(16).toString("hex")) {
  return {
    passwordSalt,
    passwordHash: scryptSync(password, passwordSalt, 64).toString("hex"),
  };
}

function verifyPassword(password, passwordHash, passwordSalt) {
  if (!passwordHash || !passwordSalt) {
    return false;
  }

  const expected = Buffer.from(passwordHash, "hex");
  const actual = scryptSync(password, passwordSalt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function createSessionToken() {
  return `${randomUUID().replace(/-/g, "")}${randomBytes(24).toString("hex")}`;
}

function createAlert(type, severity, payload) {
  return {
    type,
    severity,
    ...payload,
    createdAt: isoNow(),
  };
}

export function createAppDatabase(dbFilePath = defaultDatabasePath) {
  if (dbFilePath !== ":memory:") {
    mkdirSync(dirname(dbFilePath), { recursive: true });
  }

  const db = new DatabaseSync(dbFilePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS snapshot_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      snapshot_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS traders_current (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      alias TEXT NOT NULL,
      forecast_accuracy_90d REAL NOT NULL,
      forecast_score REAL NOT NULL,
      open_exposure REAL NOT NULL,
      focus_json TEXT NOT NULL,
      trader_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS signals_current (
      id TEXT PRIMARY KEY,
      market_slug TEXT NOT NULL,
      market_title TEXT NOT NULL,
      trader_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      action TEXT NOT NULL,
      side TEXT NOT NULL,
      size_usd REAL NOT NULL,
      timestamp_ms INTEGER NOT NULL,
      signal_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_signals_market ON signals_current(market_slug, timestamp_ms DESC);

    CREATE TABLE IF NOT EXISTS markets_current (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      latest_timestamp_ms INTEGER NOT NULL,
      signal_count INTEGER NOT NULL,
      trader_count INTEGER NOT NULL,
      total_size_usd REAL NOT NULL,
      market_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      wallet TEXT NOT NULL,
      label TEXT NOT NULL,
      thesis TEXT NOT NULL,
      prefs_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, wallet)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      dedupe_key TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      wallet TEXT,
      trader_id TEXT,
      market_slug TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      alert_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      message TEXT,
      traders_synced INTEGER DEFAULT 0,
      interval_ms INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS backtest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      run_key TEXT NOT NULL UNIQUE,
      trader_id TEXT NOT NULL,
      trader_alias TEXT NOT NULL,
      forecast_score REAL NOT NULL,
      forecast_accuracy_90d REAL NOT NULL,
      input_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      snapshot_generated_at TEXT,
      window_start TEXT,
      window_end TEXT,
      event_count INTEGER NOT NULL DEFAULT 0,
      roi REAL NOT NULL DEFAULT 0,
      net_pnl REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_backtest_runs_created_at ON backtest_runs(created_at DESC);

    CREATE TABLE IF NOT EXISTS notification_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL,
      status_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      alert_id INTEGER,
      channel_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'alert',
      status TEXT NOT NULL,
      response_code INTEGER,
      error_message TEXT,
      delivery_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE SET NULL,
      FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at ON notification_deliveries(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries(status, created_at DESC);
  `);

  function runTransaction(fn) {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Ignore rollback failure.
      }
      throw error;
    }
  }

  function tableColumns(tableName) {
    return db.prepare(`PRAGMA table_info('${tableName}')`).all();
  }

  function hasColumn(tableName, columnName) {
    return tableColumns(tableName).some((column) => column.name === columnName);
  }

  function ensureColumn(tableName, columnName, statement) {
    if (!hasColumn(tableName, columnName)) {
      db.exec(statement);
    }
  }

  function ensureWatchlistSchema() {
    const columns = tableColumns("watchlist_targets");
    const hasId = columns.some((column) => column.name === "id");
    const hasUserId = columns.some((column) => column.name === "user_id");
    const hasPrefsJson = columns.some((column) => column.name === "prefs_json");

    if (hasId && hasUserId && hasPrefsJson) {
      return;
    }

    runTransaction(() => {
      db.exec("ALTER TABLE watchlist_targets RENAME TO watchlist_targets_legacy");
      db.exec(`
        CREATE TABLE watchlist_targets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          wallet TEXT NOT NULL,
          label TEXT NOT NULL,
          thesis TEXT NOT NULL,
          prefs_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE (user_id, wallet)
        )
      `);

      const prefsExpression = hasPrefsJson ? "prefs_json" : "'{}'";
      db.exec(`
        INSERT INTO watchlist_targets (user_id, wallet, label, thesis, prefs_json, created_at, updated_at)
        SELECT NULL, lower(wallet), label, thesis, ${prefsExpression}, created_at, updated_at
        FROM watchlist_targets_legacy
      `);
      db.exec("DROP TABLE watchlist_targets_legacy");
    });
  }

  ensureWatchlistSchema();
  ensureColumn("alerts", "user_id", "ALTER TABLE alerts ADD COLUMN user_id TEXT");
  ensureColumn("backtest_runs", "user_id", "ALTER TABLE backtest_runs ADD COLUMN user_id TEXT");
  ensureColumn("notification_channels", "user_id", "ALTER TABLE notification_channels ADD COLUMN user_id TEXT");
  ensureColumn("notification_deliveries", "user_id", "ALTER TABLE notification_deliveries ADD COLUMN user_id TEXT");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, expires_at DESC);
    CREATE INDEX IF NOT EXISTS idx_watchlist_targets_user ON watchlist_targets(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_user_created_at ON alerts(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_backtest_runs_user_created_at ON backtest_runs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notification_channels_user_created_at ON notification_channels(user_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_created_at ON notification_deliveries(user_id, created_at DESC);
  `);

  const backtestSelectColumns = `
    id,
    run_key AS runKey,
    trader_id AS traderId,
    trader_alias AS traderAlias,
    forecast_score AS forecastScore,
    forecast_accuracy_90d AS forecastAccuracy90d,
    snapshot_generated_at AS snapshotGeneratedAt,
    input_json AS inputJson,
    result_json AS resultJson,
    created_at AS createdAt
  `;
  const channelSelectColumns = `
    id,
    label,
    type,
    enabled,
    config_json AS configJson,
    status_json AS statusJson,
    created_at AS createdAt,
    updated_at AS updatedAt
  `;
  const deliverySelectColumns = `
    d.id,
    d.alert_id AS alertId,
    d.channel_id AS channelId,
    d.kind,
    d.status,
    d.response_code AS responseCode,
    d.error_message AS errorMessage,
    d.delivery_json AS deliveryJson,
    d.created_at AS createdAt,
    d.sent_at AS sentAt,
    c.label AS channelLabel,
    c.type AS channelType,
    c.enabled AS channelEnabled,
    c.config_json AS configJson,
    c.status_json AS statusJson
  `;

  function cleanupExpiredSessions() {
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(isoNow());
  }

  function fetchSessionRowByToken(sessionToken) {
    return db.prepare(`
      SELECT
        s.id AS sessionId,
        s.session_token AS sessionToken,
        s.created_at AS sessionCreatedAt,
        s.updated_at AS sessionUpdatedAt,
        s.last_seen_at AS lastSeenAt,
        s.expires_at AS expiresAt,
        u.id AS userId,
        u.username,
        u.display_name AS displayName,
        u.created_at AS userCreatedAt,
        u.updated_at AS userUpdatedAt,
        u.last_login_at AS lastLoginAt
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_token = ?
    `).get(sessionToken);
  }

  function listUsers() {
    return db
      .prepare(`
        SELECT
          id,
          username,
          display_name AS displayName,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_login_at AS lastLoginAt
        FROM users
        ORDER BY datetime(created_at) ASC, id ASC
      `)
      .all()
      .map((row) => serializeUserRow(row));
  }

  function getUser(userId) {
    const row = db.prepare(`
      SELECT
        id,
        username,
        display_name AS displayName,
        created_at AS createdAt,
        updated_at AS updatedAt,
        last_login_at AS lastLoginAt
      FROM users
      WHERE id = ?
    `).get(userId);
    return serializeUserRow(row);
  }

  function createSessionForUser(userId) {
    const user = getUser(userId);
    if (!user) {
      throw new Error("User not found.");
    }

    cleanupExpiredSessions();

    const now = isoNow();
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
    const sessionId = randomUUID();
    const sessionToken = createSessionToken();

    runTransaction(() => {
      db.prepare(`
        INSERT INTO sessions (
          id, user_id, session_token, created_at, updated_at, last_seen_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(sessionId, userId, sessionToken, now, now, now, expiresAt);

      db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now, userId);
    });

    return {
      sessionToken,
      session: getSessionByToken(sessionToken, { refresh: false }),
    };
  }

  function registerUser(payload = {}) {
    const validation = validateRegistrationInput(payload);
    if (!validation.isValid) {
      throw new Error(Object.values(validation.errors).join(" "));
    }

    const { displayName, username, password } = validation.normalized;
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) {
      throw new Error("That username is already in use.");
    }

    const now = isoNow();
    const userId = randomUUID();
    const { passwordHash, passwordSalt } = hashPassword(password);

    db.prepare(`
      INSERT INTO users (
        id,
        username,
        display_name,
        password_hash,
        password_salt,
        created_at,
        updated_at,
        last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(userId, username, displayName, passwordHash, passwordSalt, now, now);

    return createSessionForUser(userId);
  }

  function loginUser(payload = {}) {
    const validation = validateLoginInput(payload);
    if (!validation.isValid) {
      throw new Error(Object.values(validation.errors).join(" "));
    }

    const { username, password } = validation.normalized;
    const row = db.prepare(`
      SELECT
        id,
        password_hash AS passwordHash,
        password_salt AS passwordSalt
      FROM users
      WHERE username = ?
    `).get(username);

    if (!row || !verifyPassword(password, row.passwordHash, row.passwordSalt)) {
      throw new Error("Invalid username or password.");
    }

    return createSessionForUser(row.id);
  }

  function getSessionByToken(sessionToken, { refresh = true } = {}) {
    if (!sessionToken) {
      return null;
    }

    cleanupExpiredSessions();
    const row = fetchSessionRowByToken(sessionToken);
    if (!row) {
      return null;
    }

    if (Date.parse(row.expiresAt || "") <= Date.now()) {
      deleteSession(sessionToken);
      return null;
    }

    if (refresh) {
      const now = isoNow();
      const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
      db.prepare(`
        UPDATE sessions
        SET last_seen_at = ?, updated_at = ?, expires_at = ?
        WHERE session_token = ?
      `).run(now, now, expiresAt, sessionToken);
      return serializeSessionRow(fetchSessionRowByToken(sessionToken));
    }

    return serializeSessionRow(row);
  }

  function deleteSession(sessionToken) {
    if (!sessionToken) {
      return;
    }

    db.prepare("DELETE FROM sessions WHERE session_token = ?").run(sessionToken);
  }

  function hasSnapshot() {
    const row = db.prepare("SELECT COUNT(1) AS count FROM snapshot_meta WHERE id = 1").get();
    return Boolean(row?.count);
  }

  function getSnapshot() {
    const row = db.prepare("SELECT snapshot_json FROM snapshot_meta WHERE id = 1").get();
    return row ? normalizeSnapshot(safeJsonParse(row.snapshot_json, createFallbackSnapshot())) : createFallbackSnapshot();
  }

  function saveSnapshot(snapshot) {
    const normalized = normalizeSnapshot(snapshot);
    const rankedTraders = rankTraders(normalized.traders, 90);
    const markets = buildMarketRecords({ ...normalized, traders: rankedTraders }, rankedTraders);
    const signals = collectSignals({ ...normalized, traders: rankedTraders }, rankedTraders);
    const now = isoNow();

    const replaceSnapshot = db.prepare(
      "INSERT OR REPLACE INTO snapshot_meta (id, snapshot_json, updated_at) VALUES (1, ?, ?)"
    );
    const clearTraders = db.prepare("DELETE FROM traders_current");
    const clearSignals = db.prepare("DELETE FROM signals_current");
    const clearMarkets = db.prepare("DELETE FROM markets_current");
    const insertTrader = db.prepare(`
      INSERT INTO traders_current (
        id, wallet, alias, forecast_accuracy_90d, forecast_score, open_exposure, focus_json, trader_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSignal = db.prepare(`
      INSERT INTO signals_current (
        id, market_slug, market_title, trader_id, wallet, action, side, size_usd, timestamp_ms, signal_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMarket = db.prepare(`
      INSERT INTO markets_current (
        slug, title, latest_timestamp_ms, signal_count, trader_count, total_size_usd, market_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    runTransaction(() => {
      replaceSnapshot.run(JSON.stringify(normalized), now);
      clearTraders.run();
      clearSignals.run();
      clearMarkets.run();

      for (const trader of rankedTraders) {
        insertTrader.run(
          trader.id,
          trader.wallet.toLowerCase(),
          trader.alias,
          trader.forecastAccuracy90d,
          trader.forecastScore,
          trader.openExposure,
          JSON.stringify(trader.focus || []),
          JSON.stringify(trader),
          now
        );
      }

      for (const signal of signals) {
        insertSignal.run(
          signal.id,
          signal.marketSlug,
          signal.marketTitle,
          signal.traderId,
          signal.wallet,
          signal.action,
          signal.side,
          signal.sizeUsd,
          signal.timestampMs,
          JSON.stringify(signal),
          now
        );
      }

      for (const market of markets) {
        insertMarket.run(
          market.slug,
          market.title,
          market.latestTimestampMs,
          market.signalCount,
          market.traderCount,
          market.totalSizeUsd,
          JSON.stringify(market),
          now
        );
      }
    });

    return normalized;
  }

  function listWatchlist(userId) {
    if (!userId) {
      return [];
    }

    return db
      .prepare(`
        SELECT
          wallet,
          label,
          thesis,
          prefs_json AS prefsJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM watchlist_targets
        WHERE user_id = ?
        ORDER BY datetime(updated_at) DESC, id DESC
      `)
      .all(userId)
      .map((row) => ({
        wallet: row.wallet,
        label: row.label,
        thesis: row.thesis,
        prefs: normalizeWatchPrefs(safeJsonParse(row.prefsJson, {})),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  }

  function upsertWatchlist(userId, target) {
    const prefs = normalizeWatchPrefs(target.prefs || {});
    const payload = {
      label: `${target.label || ""}`.trim(),
      wallet: `${target.wallet || ""}`.trim().toLowerCase(),
      thesis: `${target.thesis || ""}`.trim(),
      prefs,
    };
    const validation = validateWatchTarget(payload);
    if (!validation.isValid) {
      throw new Error(Object.values(validation.errors).join(" "));
    }

    const existing = db
      .prepare("SELECT created_at AS createdAt FROM watchlist_targets WHERE user_id = ? AND wallet = ?")
      .get(userId, payload.wallet);
    const now = isoNow();

    db.prepare(`
      INSERT INTO watchlist_targets (user_id, wallet, label, thesis, prefs_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, wallet) DO UPDATE SET
        label = excluded.label,
        thesis = excluded.thesis,
        prefs_json = excluded.prefs_json,
        updated_at = excluded.updated_at
    `).run(
      userId,
      payload.wallet,
      payload.label,
      payload.thesis,
      JSON.stringify(payload.prefs),
      existing?.createdAt || now,
      now
    );

    return payload;
  }

  function deleteWatchlist(userId, wallet) {
    db.prepare("DELETE FROM watchlist_targets WHERE user_id = ? AND wallet = ?").run(
      userId,
      `${wallet || ""}`.trim().toLowerCase()
    );
  }

  function listAlerts(userId = null, limit = 20) {
    const query = userId
      ? `
        SELECT id, created_at AS createdAt, read_at AS readAt, alert_json
        FROM alerts
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `
      : `
        SELECT id, created_at AS createdAt, read_at AS readAt, alert_json
        FROM alerts
        WHERE user_id IS NULL
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `;
    const rows = userId ? db.prepare(query).all(userId, limit) : db.prepare(query).all(limit);

    return rows.map((row) => ({
      ...translateLegacyCopy(safeJsonParse(row.alert_json, {})),
      id: row.id,
      createdAt: row.createdAt,
      readAt: row.readAt,
    }));
  }

  function markAllAlertsRead(userId) {
    if (!userId) {
      return;
    }

    db.prepare("UPDATE alerts SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(isoNow(), userId);
  }

  function listMarketSummaries(limit = 12) {
    return db
      .prepare("SELECT market_json FROM markets_current ORDER BY latest_timestamp_ms DESC LIMIT ?")
      .all(limit)
      .map((row) => {
        const market = translateLegacyCopy(safeJsonParse(row.market_json, null));
        return market
          ? {
              slug: market.slug,
              title: market.title,
              latestTimestamp: market.latestTimestamp,
              latestTimestampMs: market.latestTimestampMs,
              signalCount: market.signalCount,
              traderCount: market.traderCount,
              totalSizeUsd: market.totalSizeUsd,
              categories: market.categories,
              consensusBias: market.consensusBias,
              topTraders: (market.topTraders || []).slice(0, 3),
              currentPrice: market.currentPrice || 0,
              priceChangePct: market.priceChangePct || 0,
              linkedAsset: market.linkedAsset || "",
            }
          : null;
      })
      .filter(Boolean);
  }

  function getMarketDetail(slug) {
    const row = db.prepare("SELECT market_json FROM markets_current WHERE slug = ?").get(slug);
    return row ? translateLegacyCopy(safeJsonParse(row.market_json, null)) : null;
  }

  function getTrader(traderId) {
    const row = db.prepare("SELECT trader_json FROM traders_current WHERE id = ?").get(traderId);
    return row ? translateLegacyCopy(safeJsonParse(row.trader_json, null)) : null;
  }

  function normalizeBacktestInput(traderId, options = {}) {
    const trader = getTrader(traderId);
    const validation = validateSimulationInput(
      {
        traderId,
        budget: options.budget ?? 1000,
        latencyMinutes: options.latencyMinutes ?? 10,
        mode: options.mode ?? "follow_exit",
        minTradeUsd: options.minTradeUsd ?? 250,
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        includeSellSignals: options.includeSellSignals ?? false,
      },
      trader ? [trader] : []
    );

    if (!validation.isValid) {
      throw new Error(Object.values(validation.errors).join(" "));
    }

    return {
      trader,
      input: validation.normalized,
    };
  }

  function getTraderBacktest(traderId, options = {}) {
    const { trader, input } = normalizeBacktestInput(traderId, options);

    return {
      traderId: trader.id,
      traderAlias: trader.alias,
      forecastScore: trader.forecastScore || 0,
      forecastAccuracy90d: trader.forecastAccuracy90d || 0,
      input,
      summary: trader.backtestSummary || buildBacktestSummary(trader),
      result: simulateHistoricalCopyFromTrader(trader, input),
    };
  }

  function listBacktestRuns(userId, limit = 8) {
    if (!userId) {
      return [];
    }

    return db
      .prepare(`
        SELECT ${backtestSelectColumns}
        FROM backtest_runs
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(userId, limit)
      .map((row) => serializeBacktestRunRow(row));
  }

  function getBacktestRun(userId, id) {
    if (!userId) {
      return null;
    }

    const row = db.prepare(`
      SELECT ${backtestSelectColumns}
      FROM backtest_runs
      WHERE id = ? AND user_id = ?
    `).get(Number(id), userId);

    return serializeBacktestRunRow(row, { includeEvents: true });
  }

  function runBacktest(userId, traderId, options = {}) {
    const preview = getTraderBacktest(traderId, options);
    const now = isoNow();
    const runKey = randomUUID();
    const result = db.prepare(`
      INSERT INTO backtest_runs (
        user_id,
        run_key,
        trader_id,
        trader_alias,
        forecast_score,
        forecast_accuracy_90d,
        input_json,
        result_json,
        snapshot_generated_at,
        window_start,
        window_end,
        event_count,
        roi,
        net_pnl,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      runKey,
      preview.traderId,
      preview.traderAlias,
      preview.forecastScore,
      preview.forecastAccuracy90d,
      JSON.stringify(preview.input),
      JSON.stringify(preview.result),
      getSnapshot().generatedAt || null,
      preview.input.startDate,
      preview.input.endDate,
      preview.result.eventCount,
      preview.result.roi,
      preview.result.netPnl,
      now
    );

    return getBacktestRun(userId, Number(result.lastInsertRowid));
  }

  function getNotificationChannel(userId, id) {
    if (!userId) {
      return null;
    }

    const row = db.prepare(`
      SELECT ${channelSelectColumns}
      FROM notification_channels
      WHERE id = ? AND user_id = ?
    `).get(Number(id), userId);

    return serializeChannelRow(row);
  }

  function listNotificationChannels(userId) {
    if (!userId) {
      return [];
    }

    return db
      .prepare(`
        SELECT ${channelSelectColumns}
        FROM notification_channels
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
      `)
      .all(userId)
      .map((row) => serializeChannelRow(row));
  }

  function upsertNotificationChannel(userId, payload) {
    const validation = validateNotificationChannel(payload);
    if (!validation.isValid) {
      throw new Error(Object.values(validation.errors).join(" "));
    }

    const channel = validation.channel;
    const now = isoNow();
    const existing = channel.id ? getNotificationChannel(userId, channel.id) : null;

    if (channel.id && !existing) {
      throw new Error("Notification channel not found.");
    }

    if (existing) {
      db.prepare(`
        UPDATE notification_channels
        SET label = ?, type = ?, enabled = ?, config_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(
        channel.label,
        channel.type,
        channel.enabled ? 1 : 0,
        JSON.stringify(channel.config),
        now,
        channel.id,
        userId
      );
      return getNotificationChannel(userId, channel.id);
    }

    const result = db.prepare(`
      INSERT INTO notification_channels (
        user_id, label, type, enabled, config_json, status_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      channel.label,
      channel.type,
      channel.enabled ? 1 : 0,
      JSON.stringify(channel.config),
      JSON.stringify(idleChannelStatus),
      now,
      now
    );

    return getNotificationChannel(userId, Number(result.lastInsertRowid));
  }

  function deleteNotificationChannel(userId, id) {
    db.prepare("DELETE FROM notification_channels WHERE id = ? AND user_id = ?").run(Number(id), userId);
  }

  function mergeNotificationChannelStatus(channelId, patch) {
    const row = db.prepare("SELECT status_json AS statusJson FROM notification_channels WHERE id = ?").get(Number(channelId));
    if (!row) {
      return;
    }

    const current = safeJsonParse(row.statusJson, {});
    const nextStatus = {
      ...current,
      ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    };

    db.prepare("UPDATE notification_channels SET status_json = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(nextStatus),
      isoNow(),
      Number(channelId)
    );
  }

  function insertNotificationDelivery(userId, channel, alert, { kind = "alert", alertId = null } = {}) {
    const result = db.prepare(`
      INSERT INTO notification_deliveries (
        user_id, alert_id, channel_id, kind, status, delivery_json, created_at
      ) VALUES (?, ?, ?, ?, 'queued', ?, ?)
    `).run(
      userId,
      alertId,
      channel.id,
      kind,
      JSON.stringify(buildDeliveryEnvelope(channel, alert, kind)),
      isoNow()
    );

    return Number(result.lastInsertRowid);
  }

  function queueNotificationDeliveries(alertEntries, { channelIds = null, kind = "alert", includeDisabled = false } = {}) {
    const allowedIds = Array.isArray(channelIds) ? new Set(channelIds.map((value) => Number(value))) : null;
    const deliveryIds = [];
    const channelCache = new Map();

    runTransaction(() => {
      for (const entry of alertEntries) {
        const alert = entry.alert || entry;
        const alertId = entry.alertId ?? entry.id ?? null;
        const userId = entry.userId ?? alert.userId ?? null;

        if (!userId) {
          continue;
        }

        if (!channelCache.has(userId)) {
          const channels = listNotificationChannels(userId).filter((channel) => {
            if (allowedIds && !allowedIds.has(channel.id)) {
              return false;
            }

            return includeDisabled ? true : channel.enabled;
          });
          channelCache.set(userId, channels);
        }

        for (const channel of channelCache.get(userId)) {
          deliveryIds.push(insertNotificationDelivery(userId, channel, alert, { kind, alertId }));
        }
      }
    });

    return deliveryIds;
  }

  function createNotificationChannelTest(userId, channelId) {
    const channel = getNotificationChannel(userId, channelId);
    if (!channel) {
      return null;
    }

    const deliveryId = queueNotificationDeliveries(
      [{ userId, alert: buildChannelTestAlert(channel), alertId: null }],
      { channelIds: [channel.id], kind: "test", includeDisabled: true }
    )[0];

    return deliveryId ? getNotificationDelivery(userId, deliveryId) : null;
  }

  function listNotificationDeliveries(userId, limit = 20) {
    if (!userId) {
      return [];
    }

    return db
      .prepare(`
        SELECT ${deliverySelectColumns}
        FROM notification_deliveries d
        JOIN notification_channels c ON c.id = d.channel_id
        WHERE d.user_id = ?
        ORDER BY d.id DESC
        LIMIT ?
      `)
      .all(userId, limit)
      .map((row) => serializeDeliveryRow(row));
  }

  function listPendingNotificationDeliveries(limit = 10) {
    return db
      .prepare(`
        SELECT ${deliverySelectColumns}
        FROM notification_deliveries d
        JOIN notification_channels c ON c.id = d.channel_id
        WHERE d.status = 'queued'
        ORDER BY d.id ASC
        LIMIT ?
      `)
      .all(limit)
      .map((row) => serializeDeliveryRow(row));
  }

  function getNotificationDelivery(userId, id) {
    if (!userId) {
      return null;
    }

    const row = db.prepare(`
      SELECT ${deliverySelectColumns}
      FROM notification_deliveries d
      JOIN notification_channels c ON c.id = d.channel_id
      WHERE d.id = ? AND d.user_id = ?
    `).get(Number(id), userId);

    return serializeDeliveryRow(row);
  }

  function markNotificationDeliveryResult(id, { status, responseCode = null, errorMessage = "", providerMeta = {} } = {}) {
    const existing = db.prepare(`
      SELECT
        id,
        channel_id AS channelId,
        kind,
        delivery_json AS deliveryJson
      FROM notification_deliveries
      WHERE id = ?
    `).get(Number(id));

    if (!existing) {
      return null;
    }

    const now = isoNow();
    const payload = {
      ...safeJsonParse(existing.deliveryJson, {}),
      providerMeta,
      status,
      attemptedAt: now,
    };

    db.prepare(`
      UPDATE notification_deliveries
      SET status = ?, response_code = ?, error_message = ?, delivery_json = ?, sent_at = ?
      WHERE id = ?
    `).run(
      status,
      responseCode,
      errorMessage || null,
      JSON.stringify(payload),
      now,
      Number(id)
    );

    mergeNotificationChannelStatus(existing.channelId, {
      lastStatus: status,
      lastError: errorMessage || "",
      lastAttemptAt: now,
      lastTestedAt: existing.kind === "test" ? now : undefined,
    });

    const refreshed = db.prepare(`
      SELECT ${deliverySelectColumns}
      FROM notification_deliveries d
      JOIN notification_channels c ON c.id = d.channel_id
      WHERE d.id = ?
    `).get(Number(id));

    return serializeDeliveryRow(refreshed);
  }

  function buildGlobalAlertTemplates(rankedTraders, marketSummaries, recentCutoffMs) {
    const alerts = [];

    for (const market of marketSummaries.filter((item) => item.traderCount >= 2).slice(0, 8)) {
      alerts.push(
        createAlert(
          market.traderCount >= 3 ? "market_cluster_high" : "market_cluster",
          market.traderCount >= 3 ? "high" : "medium",
          {
            dedupeKey: `market:${market.slug}:${market.latestTimestampMs}`,
            marketSlug: market.slug,
            title: `${market.title} crowding alert`,
            message: `${market.traderCount} top traders entered the same market.`,
          }
        )
      );
    }

    for (const trader of rankedTraders.slice(0, 5)) {
      const latest = trader.recentActivities?.[0];
      if (!latest || (latest.timestampMs || 0) < recentCutoffMs) {
        continue;
      }

      alerts.push(
        createAlert("top_trader_signal", isHighConvictionActivity(latest) ? "high" : "medium", {
          dedupeKey: `trader:${trader.id}:${latest.transactionHash || latest.timestampMs}:${latest.marketSlug || slugifyText(latest.market)}`,
          wallet: trader.wallet,
          traderId: trader.id,
          marketSlug: latest.marketSlug || slugifyText(latest.market),
          title: `${trader.alias} new signal`,
          message: `${trader.alias} posted a ${latest.action.toLowerCase()} signal in ${latest.market}.`,
        })
      );
    }

    return alerts;
  }

  function buildUserAlertCopies(userId, templates) {
    return templates.map((alert) => ({
      ...alert,
      userId,
      dedupeKey: `user:${userId}:${alert.dedupeKey}`,
    }));
  }

  function buildWatchlistAlertsForUser(userId, traderMap, recentCutoffMs) {
    const alerts = [];
    const watchlist = listWatchlist(userId);

    for (const item of watchlist) {
      const trader = traderMap.get(item.wallet.toLowerCase());
      if (!trader) {
        continue;
      }

      const prefs = normalizeWatchPrefs(item.prefs || {});
      for (const activity of trader.recentActivities || []) {
        if ((activity.timestampMs || 0) < recentCutoffMs) {
          continue;
        }

        if (!matchesWatchPrefs(activity, trader, prefs)) {
          continue;
        }

        const severity = isHighConvictionActivity(activity) || trader.forecastScore >= 80 ? "high" : "medium";
        alerts.push(
          createAlert("watchlist_activity", severity, {
            userId,
            dedupeKey: `user:${userId}:watchlist:${item.wallet}:${activity.transactionHash || activity.timestampMs}:${activity.marketSlug || slugifyText(activity.market)}`,
            wallet: item.wallet,
            traderId: trader.id,
            marketSlug: activity.marketSlug || slugifyText(activity.market),
            title: `${item.label} activity detected`,
            message: `${trader.alias} posted a ${activity.action.toLowerCase()} signal in ${activity.market} (${activity.side}, ${activity.size}).`,
          })
        );
      }
    }

    return alerts;
  }

  function generateAlerts(snapshot = getSnapshot(), { userIds = null, includePublic = true } = {}) {
    const normalized = normalizeSnapshot(snapshot);
    const rankedTraders = rankTraders(normalized.traders || [], 90);
    const traderMap = new Map(rankedTraders.map((trader) => [trader.wallet.toLowerCase(), trader]));
    const marketSummaries = buildMarketRecords({ ...normalized, traders: rankedTraders }, rankedTraders);
    const recentCutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const globalTemplates = buildGlobalAlertTemplates(rankedTraders, marketSummaries, recentCutoffMs);
    const allUsers = listUsers();
    const validUserIds = userIds
      ? [...new Set(userIds)].filter((userId) => allUsers.some((user) => user.id === userId))
      : allUsers.map((user) => user.id);
    const alerts = [];

    if (includePublic) {
      alerts.push(...globalTemplates);
    }

    for (const userId of validUserIds) {
      alerts.push(...buildUserAlertCopies(userId, globalTemplates));
      alerts.push(...buildWatchlistAlertsForUser(userId, traderMap, recentCutoffMs));
    }

    const insertAlert = db.prepare(`
      INSERT OR IGNORE INTO alerts (
        user_id, dedupe_key, type, severity, wallet, trader_id, market_slug, title, message, alert_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let inserted = 0;
    const insertedAlerts = [];
    runTransaction(() => {
      for (const alert of alerts) {
        const result = insertAlert.run(
          alert.userId || null,
          alert.dedupeKey,
          alert.type,
          alert.severity,
          alert.wallet || null,
          alert.traderId || null,
          alert.marketSlug || null,
          alert.title,
          alert.message,
          JSON.stringify(alert),
          alert.createdAt
        );
        const changes = Number(result.changes || 0);
        inserted += changes;
        if (changes > 0) {
          insertedAlerts.push({
            id: Number(result.lastInsertRowid),
            userId: alert.userId || null,
            alert,
          });
        }
      }
    });

    if (insertedAlerts.length) {
      queueNotificationDeliveries(insertedAlerts.filter((entry) => entry.userId), { kind: "alert" });
    }

    return inserted;
  }

  function startSyncRun({ source = "manual", intervalMs = 0 } = {}) {
    const result = db
      .prepare(
        "INSERT INTO sync_runs (source, started_at, status, interval_ms) VALUES (?, ?, 'running', ?)"
      )
      .run(source, isoNow(), intervalMs);
    return Number(result.lastInsertRowid);
  }

  function finishSyncRun(id, { status, message = "", tradersSynced = 0 } = {}) {
    db.prepare(
      "UPDATE sync_runs SET finished_at = ?, status = ?, message = ?, traders_synced = ? WHERE id = ?"
    ).run(isoNow(), status, message, tradersSynced, id);
  }

  function getLatestSyncRun() {
    const row = db
      .prepare(
        "SELECT id, source, started_at AS startedAt, finished_at AS finishedAt, status, message, traders_synced AS tradersSynced, interval_ms AS intervalMs FROM sync_runs ORDER BY id DESC LIMIT 1"
      )
      .get();
    return row || null;
  }

  function close() {
    db.close();
  }

  cleanupExpiredSessions();

  return {
    dbFilePath,
    close,
    createNotificationChannelTest,
    deleteNotificationChannel,
    deleteSession,
    deleteWatchlist,
    finishSyncRun,
    generateAlerts,
    getBacktestRun,
    getLatestSyncRun,
    getMarketDetail,
    getNotificationChannel,
    getNotificationDelivery,
    getSessionByToken,
    getSnapshot,
    getTrader,
    getTraderBacktest,
    getUser,
    hasSnapshot,
    listAlerts,
    listBacktestRuns,
    listMarketSummaries,
    listNotificationChannels,
    listNotificationDeliveries,
    listPendingNotificationDeliveries,
    listUsers,
    listWatchlist,
    loginUser,
    markAllAlertsRead,
    markNotificationDeliveryResult,
    registerUser,
    runBacktest,
    saveSnapshot,
    startSyncRun,
    upsertNotificationChannel,
    upsertWatchlist,
  };
}

