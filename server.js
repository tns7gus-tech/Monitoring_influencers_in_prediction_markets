import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

import { createMonitorService } from "./src/monitor-service.js";

const rootDir = resolve(".");
const port = Number(process.env.PORT || 4173);
const syncIntervalMs = Number(process.env.SYNC_INTERVAL_MS || 300000);
const sessionCookieName = "prediction_alpha_session";
const sessionCookieMaxAge = 30 * 24 * 60 * 60;
const service = createMonitorService({ syncIntervalMs });
await service.bootstrap();
service.startBackgroundSync();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function safeResolve(urlPath) {
  const withoutQuery = urlPath.split("?")[0];
  const candidate = withoutQuery === "/" ? "/index.html" : withoutQuery;
  const filePath = normalize(join(rootDir, candidate));

  if (!filePath.startsWith(rootDir)) {
    return null;
  }

  return filePath;
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-cache",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function buildBacktestOptions(requestUrl) {
  return {
    budget: Number(requestUrl.searchParams.get("budget") || 1000),
    latencyMinutes: Number(requestUrl.searchParams.get("latencyMinutes") || 10),
    mode: requestUrl.searchParams.get("mode") || "follow_exit",
    minTradeUsd: Number(requestUrl.searchParams.get("minTradeUsd") || 250),
    startDate: requestUrl.searchParams.get("startDate") || null,
    endDate: requestUrl.searchParams.get("endDate") || null,
    includeSellSignals: requestUrl.searchParams.get("includeSellSignals") === "true",
  };
}

function parseCookies(request) {
  const raw = `${request.headers.cookie || ""}`;
  return Object.fromEntries(
    raw
      .split(";")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const separator = pair.indexOf("=");
        if (separator < 0) {
          return [pair, ""];
        }

        const key = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        return [key, decodeURIComponent(value)];
      })
  );
}

function buildSessionCookie(token) {
  return [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${sessionCookieMaxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
}

function buildClearedSessionCookie() {
  return [
    `${sessionCookieName}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
}

function withSession(payload, session) {
  return {
    ...payload,
    session,
  };
}

function requireAuth(session, response) {
  if (session?.user?.id) {
    return session.user.id;
  }

  sendJson(response, 401, {
    error: "unauthorized",
    message: "Authentication required.",
  });
  return null;
}

async function resolveSession(request) {
  const cookies = parseCookies(request);
  const sessionToken = cookies[sessionCookieName] || "";
  const session = service.getSession(sessionToken);

  return {
    session,
    sessionToken,
    shouldClearCookie: Boolean(sessionToken && !session),
  };
}

async function handleApi(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  const auth = await resolveSession(request);
  const sessionHeaders = auth.shouldClearCookie ? { "Set-Cookie": buildClearedSessionCookie() } : {};

  if (requestUrl.pathname === "/api/health" && request.method === "GET") {
    sendJson(
      response,
      200,
      { ok: true, platform: "Polymarket", syncStatus: service.getSyncStatus(), session: auth.session },
      sessionHeaders
    );
    return true;
  }

  if (requestUrl.pathname === "/api/session" && request.method === "GET") {
    sendJson(response, 200, { session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname === "/api/session/register" && request.method === "POST") {
    try {
      const payload = await readJsonBody(request);
      const result = await service.registerUser(payload);
      sendJson(
        response,
        201,
        withSession(result.bootstrap, result.session),
        { "Set-Cookie": buildSessionCookie(result.sessionToken) }
      );
    } catch (error) {
      sendJson(response, 400, { error: "invalid_registration", message: error.message }, sessionHeaders);
    }
    return true;
  }

  if (requestUrl.pathname === "/api/session/login" && request.method === "POST") {
    try {
      const payload = await readJsonBody(request);
      const result = await service.loginUser(payload);
      sendJson(
        response,
        200,
        withSession(result.bootstrap, result.session),
        { "Set-Cookie": buildSessionCookie(result.sessionToken) }
      );
    } catch (error) {
      sendJson(response, 400, { error: "invalid_login", message: error.message }, sessionHeaders);
    }
    return true;
  }

  if (requestUrl.pathname === "/api/session/logout" && request.method === "POST") {
    const payload = service.logoutSession(auth.sessionToken);
    sendJson(
      response,
      200,
      withSession(payload, null),
      { "Set-Cookie": buildClearedSessionCookie() }
    );
    return true;
  }

  if (requestUrl.pathname === "/api/bootstrap" && request.method === "GET") {
    sendJson(response, 200, withSession(service.getBootstrapData(auth.session?.user?.id || null), auth.session), sessionHeaders);
    return true;
  }

  if (requestUrl.pathname === "/api/snapshot" && request.method === "GET") {
    sendJson(response, 200, { snapshot: service.getSnapshot(), session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname === "/api/watchlist" && request.method === "GET") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }
    sendJson(response, 200, { items: service.listWatchlist(userId), session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname === "/api/watchlist" && request.method === "POST") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }

    try {
      const payload = await readJsonBody(request);
      sendJson(response, 201, { ...service.addWatchlist(userId, payload), session: auth.session }, sessionHeaders);
    } catch (error) {
      sendJson(response, 400, { error: "invalid_watchlist", message: error.message }, sessionHeaders);
    }
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/watchlist/") && request.method === "DELETE") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }

    const wallet = decodeURIComponent(requestUrl.pathname.replace("/api/watchlist/", ""));
    sendJson(response, 200, { ...service.removeWatchlist(userId, wallet), session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname === "/api/alerts" && request.method === "GET") {
    const limit = Number(requestUrl.searchParams.get("limit") || 20);
    sendJson(
      response,
      200,
      { items: service.listAlerts(auth.session?.user?.id || null, limit), session: auth.session },
      sessionHeaders
    );
    return true;
  }

  if (requestUrl.pathname === "/api/alerts/read-all" && request.method === "POST") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }

    sendJson(response, 200, { items: service.markAllAlertsRead(userId), session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname === "/api/notification-channels" && request.method === "GET") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }

    sendJson(response, 200, { items: service.listNotificationChannels(userId), session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname === "/api/notification-channels" && request.method === "POST") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }

    try {
      const payload = await readJsonBody(request);
      sendJson(response, 201, { ...service.addNotificationChannel(userId, payload), session: auth.session }, sessionHeaders);
    } catch (error) {
      sendJson(response, 400, { error: "invalid_notification_channel", message: error.message }, sessionHeaders);
    }
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/notification-channels/") && requestUrl.pathname.endsWith("/test") && request.method === "POST") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }

    const id = Number(
      decodeURIComponent(requestUrl.pathname.replace("/api/notification-channels/", "").replace("/test", ""))
    );
    const result = await service.testNotificationChannel(userId, id);
    if (!result) {
      sendJson(response, 404, { error: "notification_channel_not_found" }, sessionHeaders);
      return true;
    }
    sendJson(response, 200, { ...result, session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/notification-channels/") && request.method === "DELETE") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }

    const id = Number(decodeURIComponent(requestUrl.pathname.replace("/api/notification-channels/", "")));
    sendJson(response, 200, { ...service.removeNotificationChannel(userId, id), session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname === "/api/notification-deliveries" && request.method === "GET") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }

    const limit = Number(requestUrl.searchParams.get("limit") || 20);
    sendJson(
      response,
      200,
      { items: service.listNotificationDeliveries(userId, limit), session: auth.session },
      sessionHeaders
    );
    return true;
  }

  if (requestUrl.pathname === "/api/markets" && request.method === "GET") {
    const limit = Number(requestUrl.searchParams.get("limit") || 12);
    sendJson(response, 200, { items: service.listMarkets(limit), session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/markets/") && request.method === "GET") {
    const slug = decodeURIComponent(requestUrl.pathname.replace("/api/markets/", ""));
    const market = service.getMarketDetail(slug);
    if (!market) {
      sendJson(response, 404, { error: "market_not_found" }, sessionHeaders);
      return true;
    }
    sendJson(response, 200, { ...market, session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname === "/api/backtests" && request.method === "GET") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }

    const limit = Number(requestUrl.searchParams.get("limit") || 8);
    sendJson(response, 200, { items: service.listBacktestRuns(userId, limit), session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname === "/api/backtests" && request.method === "POST") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }

    try {
      const payload = await readJsonBody(request);
      sendJson(response, 201, { ...service.runBacktest(userId, payload), session: auth.session }, sessionHeaders);
    } catch (error) {
      sendJson(response, 400, { error: "invalid_backtest", message: error.message }, sessionHeaders);
    }
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/backtests/") && request.method === "GET") {
    const userId = requireAuth(auth.session, response);
    if (!userId) {
      return true;
    }

    const id = Number(decodeURIComponent(requestUrl.pathname.replace("/api/backtests/", "")));
    const run = service.getBacktestRun(userId, id);
    if (!run) {
      sendJson(response, 404, { error: "backtest_not_found" }, sessionHeaders);
      return true;
    }
    sendJson(response, 200, { ...run, session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/traders/") && requestUrl.pathname.endsWith("/backtest") && request.method === "GET") {
    const traderId = decodeURIComponent(
      requestUrl.pathname.replace("/api/traders/", "").replace("/backtest", "")
    );

    try {
      const backtest = service.getTraderBacktest(traderId, buildBacktestOptions(requestUrl));
      if (!backtest) {
        sendJson(response, 404, { error: "trader_not_found" }, sessionHeaders);
        return true;
      }

      sendJson(response, 200, { ...backtest, session: auth.session }, sessionHeaders);
    } catch (error) {
      sendJson(response, 400, { error: "invalid_backtest", message: error.message }, sessionHeaders);
    }
    return true;
  }

  if (requestUrl.pathname === "/api/sync-status" && request.method === "GET") {
    sendJson(response, 200, { ...service.getSyncStatus(), session: auth.session }, sessionHeaders);
    return true;
  }

  if (requestUrl.pathname === "/api/sync" && request.method === "POST") {
    try {
      const payload = await service.syncNow("manual", auth.session?.user?.id || null);
      sendJson(response, 200, withSession(payload, auth.session), sessionHeaders);
    } catch (error) {
      sendJson(response, 500, {
        error: "sync_failed",
        message: error.message,
        syncStatus: service.getSyncStatus(),
      }, sessionHeaders);
    }
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "not_found" }, sessionHeaders);
    return true;
  }

  return false;
}

const server = createServer(async (request, response) => {
  try {
    const handled = await handleApi(request, response);
    if (handled) {
      return;
    }

    const filePath = safeResolve(request.url || "/");

    if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const extension = extname(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
    });

    createReadStream(filePath).pipe(response);
  } catch (error) {
    sendJson(response, 500, {
      error: "internal_error",
      message: error.message,
    });
  }
});

process.on("SIGINT", () => {
  service.close();
  server.close(() => process.exit(0));
});

server.listen(port, () => {
  console.log(`Prediction market monitor is available at http://127.0.0.1:${port}`);
  console.log(`Background sync interval: ${Math.round(syncIntervalMs / 60000)} minute(s)`);
});
