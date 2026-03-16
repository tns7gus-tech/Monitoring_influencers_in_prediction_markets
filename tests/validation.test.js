import test from "node:test";
import assert from "node:assert/strict";

import { traders } from "../src/data.js";
import {
  validateLoginInput,
  normalizeWatchPrefs,
  validateNotificationChannel,
  validateRegistrationInput,
  validateSimulationInput,
  validateWatchTarget,
} from "../src/metrics.js";

test("registration validation accepts supported credentials", () => {
  const result = validateRegistrationInput({
    displayName: "Market Desk",
    username: "market_desk",
    password: "strongpass1",
  });

  assert.equal(result.isValid, true);
  assert.equal(result.normalized.username, "market_desk");
});

test("registration validation rejects unsupported username and short password", () => {
  const result = validateRegistrationInput({
    displayName: "A",
    username: "Bad Name",
    password: "123",
  });

  assert.equal(result.isValid, false);
  assert.ok(result.errors.displayName);
  assert.ok(result.errors.username);
  assert.ok(result.errors.password);
});

test("login validation rejects malformed username and empty password", () => {
  const result = validateLoginInput({
    username: "Bad Name",
    password: "",
  });

  assert.equal(result.isValid, false);
  assert.ok(result.errors.username);
  assert.ok(result.errors.password);
});

test("watch target validation accepts a valid wallet payload with prefs", () => {
  const result = validateWatchTarget({
    label: "Macro Scout",
    wallet: "0x95f9c7d3f847b4cf68d3fd1402d63d10f3e47f31",
    thesis: "This wallet shows a clear pattern of early entries in politics and macro events.",
    prefs: {
      minSizeUsd: 1500,
      minForecastScore: 72,
      alertMode: "high_conviction",
      marketCategory: "Macro",
      sideFilter: "yes_only",
      recentHours: 12,
    },
  });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.prefs, {
    minSizeUsd: 1500,
    minForecastScore: 72,
    alertMode: "high_conviction",
    marketCategory: "Macro",
    sideFilter: "yes_only",
    recentHours: 12,
  });
});

test("watch target validation rejects malformed wallet payload and invalid prefs", () => {
  const result = validateWatchTarget({
    label: "A",
    wallet: "0x1234",
    thesis: "too short",
    prefs: {
      minSizeUsd: -10,
      minForecastScore: 120,
      alertMode: "instant",
      marketCategory: "Unknown",
      sideFilter: "long_only",
      recentHours: 300,
    },
  });

  assert.equal(result.isValid, false);
  assert.ok(result.errors.label);
  assert.ok(result.errors.wallet);
  assert.ok(result.errors.thesis);
  assert.ok(result.errors.minSizeUsd);
  assert.ok(result.errors.minForecastScore);
  assert.ok(result.errors.alertMode);
  assert.ok(result.errors.marketCategory);
  assert.ok(result.errors.sideFilter);
  assert.ok(result.errors.recentHours);
});

test("normalizeWatchPrefs falls back to safe defaults", () => {
  assert.deepEqual(normalizeWatchPrefs({}), {
    minSizeUsd: 0,
    minForecastScore: 0,
    alertMode: "all",
    marketCategory: "all",
    sideFilter: "all",
    recentHours: 0,
  });
});

test("notification channel validation accepts webhook and log-only payloads", () => {
  const logOnly = validateNotificationChannel({
    label: "Ops Log",
    type: "log_only",
    enabled: true,
  });
  const webhook = validateNotificationChannel({
    label: "Discord Alerts",
    type: "discord_webhook",
    webhookUrl: "mock://success",
    enabled: true,
  });

  assert.equal(logOnly.isValid, true);
  assert.equal(webhook.isValid, true);
  assert.equal(webhook.channel.config.webhookUrl, "mock://success");
});

test("notification channel validation rejects invalid transport fields", () => {
  const result = validateNotificationChannel({
    label: "A",
    type: "telegram_bot",
    botToken: "bad",
    chatId: "",
  });

  assert.equal(result.isValid, false);
  assert.ok(result.errors.label);
  assert.ok(result.errors.botToken);
  assert.ok(result.errors.chatId);
});

test("simulation validation requires a known trader and safe numeric range", () => {
  const result = validateSimulationInput(
    {
      traderId: traders[1].id,
      latencyMinutes: 10,
      budget: 500,
      mode: "follow_exit",
      minTradeUsd: 250,
      startDate: "2026-03-01",
      endDate: "2026-03-14",
    },
    traders
  );

  assert.equal(result.isValid, true);
  assert.equal(result.normalized.startDate, "2026-03-01");
  assert.equal(result.normalized.endDate, "2026-03-14");
  assert.equal(result.normalized.minTradeUsd, 250);
});

test("simulation validation rejects unsupported mode and unsafe ranges", () => {
  const result = validateSimulationInput(
    {
      traderId: "unknown",
      latencyMinutes: 0,
      budget: 10,
      mode: "instant",
      minTradeUsd: -5,
    },
    traders
  );

  assert.equal(result.isValid, false);
  assert.ok(result.errors.traderId);
  assert.ok(result.errors.latencyMinutes);
  assert.ok(result.errors.budget);
  assert.ok(result.errors.mode);
  assert.ok(result.errors.minTradeUsd);
});

test("simulation validation rejects inverted date windows", () => {
  const result = validateSimulationInput(
    {
      traderId: traders[0].id,
      latencyMinutes: 10,
      budget: 1000,
      mode: "follow_exit",
      minTradeUsd: 250,
      startDate: "2026-03-20",
      endDate: "2026-03-01",
    },
    traders
  );

  assert.equal(result.isValid, false);
  assert.ok(result.errors.startDate);
  assert.ok(result.errors.endDate);
});

test("simulation validation rejects impossible calendar dates", () => {
  const result = validateSimulationInput(
    {
      traderId: traders[0].id,
      latencyMinutes: 10,
      budget: 1000,
      mode: "follow_exit",
      minTradeUsd: 250,
      startDate: "2026-02-30",
      endDate: "2026-03-01",
    },
    traders
  );

  assert.equal(result.isValid, false);
  assert.equal(result.errors.startDate, "Start date format is invalid.");
});
