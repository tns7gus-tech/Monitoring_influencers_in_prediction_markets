import { createAppDatabase } from "./db.js";
import { dispatchNotificationDelivery } from "./notifications.js";
import { readSnapshot, snapshotFilePath, syncPolymarketSnapshot } from "./sync.js";

export function createMonitorService({
  dbFilePath,
  syncIntervalMs = Number(process.env.SYNC_INTERVAL_MS || 300000),
} = {}) {
  const database = createAppDatabase(dbFilePath);
  let syncPromise = null;
  let notificationPromise = null;
  let syncInProgress = false;
  let timer = null;

  function getSyncStatus() {
    const latest = database.getLatestSyncRun();
    return {
      ...(latest || {
        id: null,
        source: "idle",
        startedAt: null,
        finishedAt: null,
        status: "idle",
        message: "No sync history available.",
        tradersSynced: 0,
        intervalMs: syncIntervalMs,
      }),
      isSyncing: syncInProgress,
      intervalMs: syncIntervalMs,
      snapshotFilePath,
      dbFilePath: database.dbFilePath,
    };
  }

  function getBootstrapData(userId = null) {
    const snapshot = database.getSnapshot();
    const markets = database.listMarketSummaries(12);

    return {
      snapshot,
      watchlist: database.listWatchlist(userId),
      alerts: database.listAlerts(userId, 20),
      markets,
      marketDetail: markets[0] ? database.getMarketDetail(markets[0].slug) : null,
      recentBacktests: database.listBacktestRuns(userId, 8),
      notificationChannels: database.listNotificationChannels(userId),
      notificationDeliveries: database.listNotificationDeliveries(userId, 20),
      syncStatus: getSyncStatus(),
    };
  }

  async function flushQueuedNotifications(limit = 20) {
    if (notificationPromise) {
      return notificationPromise;
    }

    notificationPromise = (async () => {
      const queued = database.listPendingNotificationDeliveries(limit);
      for (const delivery of queued) {
        try {
          const providerMeta = await dispatchNotificationDelivery(delivery);
          database.markNotificationDeliveryResult(delivery.id, {
            status: "sent",
            responseCode: providerMeta.responseCode ?? 200,
            providerMeta,
          });
        } catch (error) {
          database.markNotificationDeliveryResult(delivery.id, {
            status: "failed",
            responseCode: error.responseCode ?? null,
            errorMessage: error.message,
            providerMeta: {
              provider: error.provider || "unknown",
            },
          });
        }
      }

      return queued.length;
    })().finally(() => {
      notificationPromise = null;
    });

    return notificationPromise;
  }

  function triggerNotificationFlush() {
    flushQueuedNotifications().catch((error) => {
      console.error(`Notification flush failed: ${error.message}`);
    });
  }

  async function bootstrap() {
    if (!database.hasSnapshot()) {
      const snapshot = await readSnapshot();
      database.saveSnapshot(snapshot);
      database.generateAlerts(snapshot);
    }

    await flushQueuedNotifications();
    return getBootstrapData();
  }

  async function syncNow(source = "manual", userId = null) {
    if (syncPromise) {
      return syncPromise;
    }

    const runId = database.startSyncRun({ source, intervalMs: syncIntervalMs });
    syncInProgress = true;

    syncPromise = (async () => {
      try {
        const snapshot = await syncPolymarketSnapshot();
        database.saveSnapshot(snapshot);
        const alertsCreated = database.generateAlerts(snapshot);
        await flushQueuedNotifications();
        database.finishSyncRun(runId, {
          status: "success",
          message: `Synced ${snapshot.traders.length} traders and generated ${alertsCreated} alerts.`,
          tradersSynced: snapshot.traders.length,
        });
        return getBootstrapData(userId);
      } catch (error) {
        database.finishSyncRun(runId, {
          status: "failed",
          message: error.message,
          tradersSynced: 0,
        });
        throw error;
      } finally {
        syncInProgress = false;
        syncPromise = null;
      }
    })();

    return syncPromise;
  }

  function startBackgroundSync() {
    if (timer || syncIntervalMs <= 0) {
      return;
    }

    timer = setInterval(() => {
      syncNow("background").catch((error) => {
        console.error(`Background sync failed: ${error.message}`);
      });
    }, syncIntervalMs);
  }

  function stopBackgroundSync() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function finalizeAuth(authResult) {
    database.generateAlerts(database.getSnapshot(), {
      userIds: [authResult.session.user.id],
      includePublic: false,
    });
    await flushQueuedNotifications();

    return {
      sessionToken: authResult.sessionToken,
      session: authResult.session,
      bootstrap: getBootstrapData(authResult.session.user.id),
    };
  }

  async function registerUser(payload) {
    return finalizeAuth(database.registerUser(payload));
  }

  async function loginUser(payload) {
    return finalizeAuth(database.loginUser(payload));
  }

  function getSession(sessionToken) {
    return database.getSessionByToken(sessionToken);
  }

  function logoutSession(sessionToken) {
    database.deleteSession(sessionToken);
    return getBootstrapData();
  }

  function listWatchlist(userId) {
    return database.listWatchlist(userId);
  }

  function addWatchlist(userId, target) {
    database.upsertWatchlist(userId, target);
    database.generateAlerts(database.getSnapshot(), {
      userIds: [userId],
      includePublic: false,
    });
    triggerNotificationFlush();
    return {
      watchlist: database.listWatchlist(userId),
      alerts: database.listAlerts(userId, 20),
      notificationDeliveries: database.listNotificationDeliveries(userId, 20),
    };
  }

  function removeWatchlist(userId, wallet) {
    database.deleteWatchlist(userId, wallet);
    return {
      watchlist: database.listWatchlist(userId),
      alerts: database.listAlerts(userId, 20),
      notificationDeliveries: database.listNotificationDeliveries(userId, 20),
    };
  }

  function listAlerts(userId, limit = 20) {
    return database.listAlerts(userId, limit);
  }

  function markAllAlertsRead(userId) {
    database.markAllAlertsRead(userId);
    return database.listAlerts(userId, 20);
  }

  function listMarkets(limit = 12) {
    return database.listMarketSummaries(limit);
  }

  function getMarketDetail(slug) {
    return database.getMarketDetail(slug);
  }

  function getTraderBacktest(traderId, options = {}) {
    return database.getTraderBacktest(traderId, options);
  }

  function runBacktest(userId, payload) {
    return {
      run: database.runBacktest(userId, payload.traderId, payload),
      recentBacktests: database.listBacktestRuns(userId, 8),
    };
  }

  function listBacktestRuns(userId, limit = 8) {
    return database.listBacktestRuns(userId, limit);
  }

  function getBacktestRun(userId, id) {
    return database.getBacktestRun(userId, id);
  }

  function listNotificationChannels(userId) {
    return database.listNotificationChannels(userId);
  }

  function addNotificationChannel(userId, payload) {
    database.upsertNotificationChannel(userId, payload);
    return {
      channels: database.listNotificationChannels(userId),
      deliveries: database.listNotificationDeliveries(userId, 20),
    };
  }

  function removeNotificationChannel(userId, id) {
    database.deleteNotificationChannel(userId, id);
    return {
      channels: database.listNotificationChannels(userId),
      deliveries: database.listNotificationDeliveries(userId, 20),
    };
  }

  function listNotificationDeliveries(userId, limit = 20) {
    return database.listNotificationDeliveries(userId, limit);
  }

  async function testNotificationChannel(userId, id) {
    const delivery = database.createNotificationChannelTest(userId, id);
    if (!delivery) {
      return null;
    }

    await flushQueuedNotifications();

    return {
      channel: database.getNotificationChannel(userId, id),
      deliveries: database.listNotificationDeliveries(userId, 20),
      latestDelivery: database.getNotificationDelivery(userId, delivery.id),
    };
  }

  function getSnapshot() {
    return database.getSnapshot();
  }

  function close() {
    stopBackgroundSync();
    database.close();
  }

  return {
    addNotificationChannel,
    addWatchlist,
    bootstrap,
    close,
    getBacktestRun,
    getBootstrapData,
    getMarketDetail,
    getSession,
    getSnapshot,
    getSyncStatus,
    getTraderBacktest,
    listAlerts,
    listBacktestRuns,
    listMarkets,
    listNotificationChannels,
    listNotificationDeliveries,
    listWatchlist,
    loginUser,
    logoutSession,
    markAllAlertsRead,
    registerUser,
    removeNotificationChannel,
    removeWatchlist,
    runBacktest,
    startBackgroundSync,
    stopBackgroundSync,
    syncNow,
    testNotificationChannel,
  };
}
