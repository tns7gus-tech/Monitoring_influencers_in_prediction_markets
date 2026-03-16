import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("index includes basic accessibility hooks", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /href="#main-content"/);
  assert.match(html, /id="main-content"/);
  assert.match(html, /aria-live="polite"/);
});

test("index includes labeled auth, watchlist, notification, prefs, and simulation forms", () => {
  assert.match(html, /for="register-display-name"/);
  assert.match(html, /for="register-username"/);
  assert.match(html, /for="register-password"/);
  assert.match(html, /for="login-username"/);
  assert.match(html, /for="login-password"/);
  assert.match(html, /for="watch-label"/);
  assert.match(html, /for="watch-wallet"/);
  assert.match(html, /for="watch-thesis"/);
  assert.match(html, /for="watch-min-size"/);
  assert.match(html, /for="watch-min-score"/);
  assert.match(html, /for="watch-alert-mode"/);
  assert.match(html, /for="watch-market-category"/);
  assert.match(html, /for="watch-side-filter"/);
  assert.match(html, /for="watch-recent-hours"/);
  assert.match(html, /for="notification-label"/);
  assert.match(html, /for="notification-type"/);
  assert.match(html, /for="notification-webhook-url"/);
  assert.match(html, /for="notification-bot-token"/);
  assert.match(html, /for="notification-chat-id"/);
  assert.match(html, /for="simulation-trader"/);
  assert.match(html, /for="simulation-latency"/);
  assert.match(html, /for="simulation-budget"/);
  assert.match(html, /for="simulation-min-trade-usd"/);
  assert.match(html, /for="simulation-start-date"/);
  assert.match(html, /for="simulation-end-date"/);
  assert.match(html, /data-date-target="simulation-start-date"/);
  assert.match(html, /data-date-target="simulation-end-date"/);
});

test("index exposes auth, sync, alerts, notification, market detail, simulation, and backtest history sections", () => {
  assert.match(html, /id="account-section"/);
  assert.match(html, /id="auth-session"/);
  assert.match(html, /id="auth-status"/);
  assert.match(html, /id="sync-button"/);
  assert.match(html, /id="snapshot-meta"/);
  assert.match(html, /id="alerts-feed"/);
  assert.match(html, /id="notification-channels"/);
  assert.match(html, /id="notification-deliveries"/);
  assert.match(html, /id="market-detail"/);
  assert.match(html, /id="simulation-output"/);
  assert.match(html, /id="simulation-submit"/);
  assert.match(html, /id="backtest-history"/);
  assert.match(html, /id="read-alerts-button"/);
  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /id="menu-toggle"/);
  assert.match(html, /id="topbar-actions-panel"/);
});

test("index exposes marketing-first positioning content and calls to action", () => {
  assert.match(html, /Signal Product Infrastructure/);
  assert.match(html, /Start your workspace/);
  assert.match(html, /Build your alert funnel/);
  assert.match(html, /aria-label="Product proof points"/);
  assert.match(html, /id="positioning-title"/);
});

test("index uses English custom date-picker controls instead of native date inputs", () => {
  assert.doesNotMatch(html, /type="date"/);
  assert.match(html, /id="simulation-start-date-panel"/);
  assert.match(html, /id="simulation-end-date-panel"/);
  assert.match(html, /Open English calendar for start date/);
  assert.match(html, /Open English calendar for end date/);
});
