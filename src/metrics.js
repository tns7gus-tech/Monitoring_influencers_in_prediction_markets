function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value, min, max) {
  if (max === min) {
    return 0;
  }

  return clamp((value - min) / (max - min), 0, 1);
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeOptionalDate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = `${value}`.trim().slice(0, 10);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return "invalid";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? normalized
    : "invalid";
}

function parseDateBoundary(value, endOfDay = false) {
  const normalized = normalizeOptionalDate(value);
  if (!normalized || normalized === "invalid") {
    return normalized;
  }

  const parsed = Date.parse(`${normalized}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(`${value || ""}`.trim());
}

function isMockTarget(value) {
  return /^mock:\/\/[\w-]+$/i.test(`${value || ""}`.trim());
}

function normalizeUsername(value) {
  return `${value || ""}`.trim().toLowerCase();
}

export const watchAlertModes = ["all", "high_conviction", "new_entries_only"];
export const watchMarketCategories = [
  "all",
  "US Politics",
  "Global Politics",
  "Crypto",
  "Macro",
  "Sports",
  "Tech",
  "Healthcare",
  "Regulation",
  "General",
];
export const watchSideFilters = ["all", "yes_only", "no_only"];
export const notificationChannelTypes = [
  "log_only",
  "discord_webhook",
  "telegram_bot",
  "generic_webhook",
];

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function calculateReliabilityScore(trader) {
  const settled = normalize(trader.settledMarkets90d, 20, 80);
  const active = normalize(trader.activeDays30d, 10, 28);
  const spread = normalize(trader.trackedCategories, 1, 4);

  return Number((100 * (0.5 * settled + 0.35 * active + 0.15 * spread)).toFixed(1));
}

export function calculateForecastScore(trader, window = 90) {
  const directionalAccuracy =
    window === 30 ? trader.forecastAccuracy30d : trader.forecastAccuracy90d;
  const normalizedAccuracy = directionalAccuracy / 100;
  const weightedAccuracy = trader.amountWeightedAccuracy90d / 100;
  const reliability = calculateReliabilityScore(trader) / 100;
  const consistency = trader.recencyConsistency / 100;
  const earlyEntry = normalize(trader.avgEntryEdgeBps, 40, 120);
  const profitability = normalize(trader.realizedRoi90d, 0, 25);

  const score =
    0.42 * normalizedAccuracy +
    0.23 * weightedAccuracy +
    0.18 * reliability +
    0.1 * consistency +
    0.04 * earlyEntry +
    0.03 * profitability;

  return Number((score * 100).toFixed(1));
}

export function filterTraders(traders, query, category) {
  const loweredQuery = query.trim().toLowerCase();

  return traders.filter((trader) => {
    const matchesQuery =
      !loweredQuery ||
      trader.alias.toLowerCase().includes(loweredQuery) ||
      trader.wallet.toLowerCase().includes(loweredQuery) ||
      trader.focus.some((item) => item.toLowerCase().includes(loweredQuery)) ||
      trader.recentSignal.market.toLowerCase().includes(loweredQuery);

    const matchesCategory = category === "all" || trader.focus.includes(category);
    return matchesQuery && matchesCategory;
  });
}

export function rankTraders(traders, window = 90) {
  return [...traders]
    .map((trader) => ({
      ...trader,
      reliabilityScore: calculateReliabilityScore(trader),
      forecastScore: calculateForecastScore(trader, window),
    }))
    .sort((left, right) => right.forecastScore - left.forecastScore);
}

export function summarizeDashboard(traders, window = 90) {
  if (traders.length === 0) {
    return {
      trackedTraders: 0,
      averageAccuracy: 0,
      averageReliability: 0,
      openExposure: 0,
      leader: null,
    };
  }

  const ranked = rankTraders(traders, window);
  const averageAccuracy =
    ranked.reduce(
      (total, trader) =>
        total + (window === 30 ? trader.forecastAccuracy30d : trader.forecastAccuracy90d),
      0
    ) / ranked.length;
  const averageReliability =
    ranked.reduce((total, trader) => total + trader.reliabilityScore, 0) / ranked.length;
  const openExposure = ranked.reduce((total, trader) => total + trader.openExposure, 0);

  return {
    trackedTraders: ranked.length,
    averageAccuracy: Number(averageAccuracy.toFixed(1)),
    averageReliability: Number(averageReliability.toFixed(1)),
    openExposure,
    leader: ranked[0],
  };
}

export function normalizeWatchPrefs(prefs = {}) {
  const minSizeUsd = parseOptionalNumber(prefs.minSizeUsd);
  const minForecastScore = parseOptionalNumber(prefs.minForecastScore);
  const alertMode = watchAlertModes.includes(prefs.alertMode) ? prefs.alertMode : "all";
  const marketCategory = watchMarketCategories.includes(prefs.marketCategory)
    ? prefs.marketCategory
    : "all";
  const sideFilter = watchSideFilters.includes(prefs.sideFilter) ? prefs.sideFilter : "all";
  const recentHours = parseOptionalNumber(prefs.recentHours);

  return {
    minSizeUsd: Number.isFinite(minSizeUsd) && minSizeUsd > 0 ? minSizeUsd : 0,
    minForecastScore: Number.isFinite(minForecastScore) && minForecastScore > 0 ? minForecastScore : 0,
    alertMode,
    marketCategory,
    sideFilter,
    recentHours: Number.isFinite(recentHours) && recentHours > 0 ? Math.round(recentHours) : 0,
  };
}

export function normalizeNotificationChannel(payload = {}) {
  const type = notificationChannelTypes.includes(payload.type) ? payload.type : "log_only";
  return {
    id: payload.id ? Number(payload.id) : null,
    label: `${payload.label || ""}`.trim(),
    type,
    enabled: payload.enabled !== false && payload.enabled !== "false",
    config: {
      webhookUrl: `${payload.webhookUrl || payload.config?.webhookUrl || ""}`.trim(),
      botToken: `${payload.botToken || payload.config?.botToken || ""}`.trim(),
      chatId: `${payload.chatId || payload.config?.chatId || ""}`.trim(),
    },
  };
}

export function validateWatchTarget(payload) {
  const errors = {};
  const label = payload.label?.trim() || "";
  const wallet = payload.wallet?.trim() || "";
  const thesis = payload.thesis?.trim() || "";
  const prefs = payload.prefs || {};

  if (label.length < 2 || label.length > 24) {
    errors.label = "Label must be 2-24 characters.";
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    errors.wallet = "Enter a valid EVM wallet address.";
  }

  if (thesis.length < 10 || thesis.length > 120) {
    errors.thesis = "Tracking thesis must be 10-120 characters.";
  }

  const minSizeUsd = parseOptionalNumber(prefs.minSizeUsd);
  if (minSizeUsd !== null && (!Number.isFinite(minSizeUsd) || minSizeUsd < 0 || minSizeUsd > 1000000)) {
    errors.minSizeUsd = "Minimum trade size must be between 0 and 1000000 USD.";
  }

  const minForecastScore = parseOptionalNumber(prefs.minForecastScore);
  if (
    minForecastScore !== null &&
    (!Number.isFinite(minForecastScore) || minForecastScore < 0 || minForecastScore > 100)
  ) {
    errors.minForecastScore = "Minimum forecast score must be between 0 and 100.";
  }

  if (prefs.alertMode !== undefined && !watchAlertModes.includes(prefs.alertMode)) {
    errors.alertMode = "Select a valid alert mode.";
  }

  if (prefs.marketCategory !== undefined && !watchMarketCategories.includes(prefs.marketCategory)) {
    errors.marketCategory = "Select a supported market category.";
  }

  if (prefs.sideFilter !== undefined && !watchSideFilters.includes(prefs.sideFilter)) {
    errors.sideFilter = "Select a supported position-side filter.";
  }

  const recentHours = parseOptionalNumber(prefs.recentHours);
  if (recentHours !== null && (!Number.isFinite(recentHours) || recentHours < 0 || recentHours > 168)) {
    errors.recentHours = "Recent-hour filter must be between 0 and 168 hours.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    prefs: normalizeWatchPrefs(prefs),
  };
}

export function validateNotificationChannel(payload) {
  const errors = {};
  const normalized = normalizeNotificationChannel(payload);

  if (normalized.label.length < 2 || normalized.label.length > 30) {
    errors.label = "Channel name must be 2-30 characters.";
  }

  if (!notificationChannelTypes.includes(normalized.type)) {
    errors.type = "Select a supported channel type.";
  }

  if (["discord_webhook", "generic_webhook"].includes(normalized.type)) {
    const webhookUrl = normalized.config.webhookUrl;
    if (!webhookUrl || (!isHttpUrl(webhookUrl) && !isMockTarget(webhookUrl))) {
      errors.webhookUrl = "Webhook URL must use http(s):// or mock://.";
    }
  }

  if (normalized.type === "telegram_bot") {
    if (!normalized.config.botToken || !/^(\d+:[\w-]+|mock)$/i.test(normalized.config.botToken)) {
      errors.botToken = "Telegram Bot Token format is invalid. Use `mock` for tests.";
    }

    if (!normalized.config.chatId || !/^(-?\d+|mock)$/i.test(normalized.config.chatId)) {
      errors.chatId = "Telegram Chat ID format is invalid. Use `mock` for tests.";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    channel: normalized,
  };
}

export function validateRegistrationInput(payload = {}) {
  const errors = {};
  const displayName = `${payload.displayName || ""}`.trim();
  const username = normalizeUsername(payload.username);
  const password = `${payload.password || ""}`;

  if (displayName.length < 2 || displayName.length > 32) {
    errors.displayName = "Display name must be 2-32 characters.";
  }

  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    errors.username = "Username must be 3-24 characters using lowercase letters, numbers, ., _, or -.";
  }

  if (password.length < 8 || password.length > 72) {
    errors.password = "Password must be 8-72 characters.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      displayName,
      username,
      password,
    },
  };
}

export function validateLoginInput(payload = {}) {
  const errors = {};
  const username = normalizeUsername(payload.username);
  const password = `${payload.password || ""}`;

  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    errors.username = "Enter a valid username.";
  }

  if (!password) {
    errors.password = "Enter a password.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      username,
      password,
    },
  };
}

export function validateSimulationInput(payload, traders) {
  const errors = {};
  const budget = Number(payload.budget);
  const latencyMinutes = Number(payload.latencyMinutes);
  const minTradeUsd = parseOptionalNumber(payload.minTradeUsd);
  const normalizedStartDate = normalizeOptionalDate(payload.startDate);
  const normalizedEndDate = normalizeOptionalDate(payload.endDate);
  const traderExists = traders.some((trader) => trader.id === payload.traderId);

  if (!traderExists) {
    errors.traderId = "Select a trader for the simulation.";
  }

  if (!Number.isFinite(budget) || budget < 25 || budget > 100000) {
    errors.budget = "Budget must be between 25 and 100000 USD.";
  }

  if (!Number.isFinite(latencyMinutes) || latencyMinutes < 1 || latencyMinutes > 120) {
    errors.latencyMinutes = "Entry delay must be between 1 and 120 minutes.";
  }

  if (!Number.isFinite(minTradeUsd ?? 250) || (minTradeUsd ?? 250) < 0 || (minTradeUsd ?? 250) > 100000) {
    errors.minTradeUsd = "Minimum trade size filter must be between 0 and 100000 USD.";
  }

  if (!["follow_exit", "hold_resolution"].includes(payload.mode)) {
    errors.mode = "Select a valid exit rule.";
  }

  if (normalizedStartDate === "invalid") {
    errors.startDate = "Start date format is invalid.";
  }

  if (normalizedEndDate === "invalid") {
    errors.endDate = "End date format is invalid.";
  }

  const startBoundary = parseDateBoundary(payload.startDate, false);
  const endBoundary = parseDateBoundary(payload.endDate, true);
  if (Number.isNaN(startBoundary)) {
    errors.startDate = "Start date format is invalid.";
  }

  if (Number.isNaN(endBoundary)) {
    errors.endDate = "End date format is invalid.";
  }

  if (!errors.startDate && !errors.endDate && startBoundary !== null && endBoundary !== null && startBoundary > endBoundary) {
    errors.startDate = "Start date must be on or before the end date.";
    errors.endDate = "End date must be on or after the start date.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      traderId: `${payload.traderId || ""}`,
      latencyMinutes,
      budget,
      mode: payload.mode,
      minTradeUsd: Number(minTradeUsd ?? 250),
      startDate: normalizedStartDate && normalizedStartDate !== "invalid" ? normalizedStartDate : null,
      endDate: normalizedEndDate && normalizedEndDate !== "invalid" ? normalizedEndDate : null,
      includeSellSignals: payload.includeSellSignals === true || payload.includeSellSignals === "true",
    },
  };
}

export function simulateCopyStrategy(trader, payload) {
  const latencyMinutes = Number(payload.latencyMinutes);
  const budget = Number(payload.budget);
  const followExit = payload.mode === "follow_exit";
  const accuracyEdge = (trader.forecastAccuracy90d - 50) / 100;
  const weightedEdge = (trader.amountWeightedAccuracy90d - 50) / 100;
  const reliabilityEdge = calculateReliabilityScore(trader) / 100;
  const latencyDecay = clamp(1 - latencyMinutes * trader.latencySensitivity, 0.3, 1);
  const holdMultiplier = followExit ? 0.92 : 1.08;
  const feeRate = 0.0045;
  const slippageRate = 0.006 + (1 - latencyDecay) * 0.012;

  const grossReturnRate =
    (0.55 * accuracyEdge + 0.25 * weightedEdge + 0.2 * reliabilityEdge) *
    latencyDecay *
    holdMultiplier;
  const costs = budget * (feeRate + slippageRate);
  const netPnl = budget * grossReturnRate - costs;
  const roi = (netPnl / budget) * 100;
  const winProbability = clamp(
    trader.forecastAccuracy90d - latencyMinutes * 0.18 + (followExit ? 0 : 1.4),
    45,
    88
  );
  const maxDrawdown = clamp(
    22 - trader.recencyConsistency * 0.08 + latencyMinutes * 0.19 + (followExit ? -1.4 : 0.8),
    6,
    30
  );
  const expectancy = netPnl / Math.max(6, trader.openPositions + trader.trackedCategories);

  return {
    traderId: trader.id,
    budget,
    latencyMinutes,
    netPnl: Number(netPnl.toFixed(2)),
    roi: Number(roi.toFixed(1)),
    winProbability: Number(winProbability.toFixed(1)),
    maxDrawdown: Number(maxDrawdown.toFixed(1)),
    expectancy: Number(expectancy.toFixed(2)),
    curve: [
      Number((budget * 0.21 * latencyDecay).toFixed(0)),
      Number((budget * 0.35 * latencyDecay).toFixed(0)),
      Number((budget * 0.56 * latencyDecay).toFixed(0)),
      Number((budget * (1 + roi / 100)).toFixed(0)),
    ],
  };
}

export function buildCategoryOptions(traders) {
  return [...new Set(traders.flatMap((trader) => trader.focus))].sort();
}

export function getTraderById(traders, traderId) {
  return traders.find((trader) => trader.id === traderId) || null;
}

