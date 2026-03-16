import {
  validateLoginInput,
  validateNotificationChannel,
  validateRegistrationInput,
  validateSimulationInput,
  validateWatchTarget,
} from "./metrics.js";
import { requestJson } from "./ui/api.js";
import { initializeDatePickers } from "./ui/date-picker.js";
import { getElements } from "./ui/elements.js";
import {
  applySimulationPayloadToForm,
  buildNotificationPayload,
  buildSimulationKey,
  buildWatchlistPayload,
  getSimulationPayloadFromForm,
  resetNotificationForm,
  resetWatchlistForm,
  setFieldErrors,
  syncFilterStateFromForm,
} from "./ui/forms.js";
import { renderDashboard } from "./ui/render.js";
import {
  applyBootstrapPayload,
  buildFallbackBootstrapPayload,
  clearPersonalizedState,
  createInitialState,
  getTraders,
  isAuthenticated,
  resetSimulationState,
} from "./ui/state.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const bootstrapRefreshMs = 60000;
const themeStorageKey = "prediction_alpha_theme";
const mobileMenuBreakpoint = window.matchMedia("(max-width: 760px)");

const state = createInitialState();
const elements = getElements();

function renderApp() {
  renderDashboard({ state, elements });
}

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme() {
  try {
    const value = window.localStorage.getItem(themeStorageKey);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function updateThemeButton(theme) {
  if (!elements.themeToggle) {
    return;
  }

  const isDark = theme === "dark";
  elements.themeToggle.textContent = `Theme: ${isDark ? "Dark" : "Light"}`;
  elements.themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
  elements.themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
}

function updateThemeMeta(theme) {
  const tag = document.querySelector('meta[name="theme-color"]');
  if (!tag) {
    return;
  }

  tag.setAttribute("content", theme === "dark" ? "#07111d" : "#0a86d8");
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  updateThemeButton(theme);
  updateThemeMeta(theme);
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);

  try {
    window.localStorage.setItem(themeStorageKey, nextTheme);
  } catch {
    // Ignore storage failures and keep the runtime theme only.
  }
}

function setMenuOpen(open) {
  if (!elements.topbar || !elements.menuToggle) {
    return;
  }

  const isOpen = Boolean(open && mobileMenuBreakpoint.matches);
  elements.topbar.classList.toggle("is-menu-open", isOpen);
  elements.menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function closeMenu() {
  setMenuOpen(false);
}

function initializeTheme() {
  applyTheme(getStoredTheme() || getSystemTheme());
}

function initializeMobileMenu() {
  closeMenu();
  mobileMenuBreakpoint.addEventListener("change", () => {
    closeMenu();
  });
}

function handleUnauthorized(error, statusElement, message = "Session expired. Please sign in again.") {
  if (error.status !== 401) {
    return false;
  }

  state.session = null;
  clearPersonalizedState(state);
  resetSimulationState(state);
  if (statusElement) {
    statusElement.textContent = message;
  }
  renderApp();
  loadBootstrap().catch(() => {
    // Fallback state is handled in loadBootstrap.
  });
  return true;
}

async function loadBootstrap() {
  try {
    const payload = await requestJson("/api/bootstrap");
    applyBootstrapPayload(state, payload);
  } catch {
    applyBootstrapPayload(state, buildFallbackBootstrapPayload(state));
  }

  renderApp();
}

async function loadMarketDetail(slug, { scroll = false } = {}) {
  if (!slug) {
    return;
  }

  state.selectedMarketSlug = slug;
  try {
    state.marketDetail = await requestJson(`/api/markets/${encodeURIComponent(slug)}`);
  } catch {
    state.marketDetail = state.markets.find((market) => market.slug === slug) || null;
  }

  renderApp();

  if (scroll) {
    document.getElementById("market-detail-section")?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }
}

async function loadSimulationFromServer(
  payload = getSimulationPayloadFromForm(elements.simulationForm),
  { announce = false } = {}
) {
  const validation = validateSimulationInput(payload, getTraders(state));
  if (!validation.isValid) {
    return;
  }

  const normalized = validation.normalized;
  const key = buildSimulationKey(normalized);
  state.simulationPending = true;
  state.pendingSimulationKey = key;
  renderApp();

  try {
    const params = new URLSearchParams({
      budget: `${normalized.budget}`,
      latencyMinutes: `${normalized.latencyMinutes}`,
      mode: normalized.mode,
      minTradeUsd: `${normalized.minTradeUsd}`,
    });
    if (normalized.startDate) {
      params.set("startDate", normalized.startDate);
    }
    if (normalized.endDate) {
      params.set("endDate", normalized.endDate);
    }

    const response = await requestJson(
      `/api/traders/${encodeURIComponent(normalized.traderId)}/backtest?${params.toString()}`
    );
    if (state.pendingSimulationKey !== key) {
      return;
    }

    state.simulationResult = response.result;
    state.simulationContext = response;
    state.simulationKey = buildSimulationKey(response.input || normalized);
    state.simulationSource = "server";
    elements.simulationStatus.textContent = announce
      ? `Loaded server preview from ${response.result.eventCount || 0} trades.`
      : `Server preview refreshed (${response.result.eventCount || 0} trades).`;
  } catch (error) {
    if (state.pendingSimulationKey !== key) {
      return;
    }
    elements.simulationStatus.textContent = `Backtest preview failed: ${error.message}`;
  } finally {
    if (state.pendingSimulationKey === key) {
      state.simulationPending = false;
      state.pendingSimulationKey = "";
      renderApp();
    }
  }
}

async function saveBacktestRun(payload) {
  const validation = validateSimulationInput(payload, getTraders(state));
  if (!validation.isValid) {
    return;
  }

  const normalized = validation.normalized;
  const key = buildSimulationKey(normalized);
  state.simulationPending = true;
  state.pendingSimulationKey = key;
  renderApp();

  try {
    const response = await requestJson("/api/backtests", {
      method: "POST",
      body: JSON.stringify(normalized),
    });
    if (state.pendingSimulationKey !== key) {
      return;
    }

    if (response.run) {
      applySimulationPayloadToForm(elements.simulationForm, response.run.input || normalized);
      state.simulationResult = response.run.result;
      state.simulationContext = response.run;
      state.simulationKey = buildSimulationKey(response.run.input || normalized);
      state.simulationSource = "stored";
    }
    state.recentBacktests = response.recentBacktests || state.recentBacktests;
    elements.simulationStatus.textContent = `Saved backtest (${response.run?.result?.eventCount || 0} trades).`;
  } catch (error) {
    if (state.pendingSimulationKey !== key) {
      return;
    }
    if (handleUnauthorized(error, elements.authStatus)) {
      return;
    }
    elements.simulationStatus.textContent = `Backtest save failed: ${error.message}`;
  } finally {
    if (state.pendingSimulationKey === key) {
      state.simulationPending = false;
      state.pendingSimulationKey = "";
      renderApp();
    }
  }
}

async function loadStoredBacktest(id) {
  try {
    const run = await requestJson(`/api/backtests/${encodeURIComponent(id)}`);
    applySimulationPayloadToForm(elements.simulationForm, run.input || {});
    state.simulationResult = run.result;
    state.simulationContext = run;
    state.simulationKey = buildSimulationKey(run.input || {});
    state.simulationSource = "stored";
    elements.simulationStatus.textContent = `Loaded stored backtest (${run.result?.eventCount || 0} trades).`;
    renderApp();
  } catch (error) {
    if (handleUnauthorized(error, elements.authStatus)) {
      return;
    }
    elements.simulationStatus.textContent = `Stored backtest load failed: ${error.message}`;
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(elements.registerForm));
  const validation = validateRegistrationInput(payload);
  setFieldErrors(elements.registerForm, validation.errors, {
    displayName: "register-display-name",
    username: "register-username",
    password: "register-password",
  });

  if (!validation.isValid) {
    elements.authStatus.textContent = Object.values(validation.errors).join(" ");
    return;
  }

  try {
    const result = await requestJson("/api/session/register", {
      method: "POST",
      body: JSON.stringify(validation.normalized),
    });
    applyBootstrapPayload(state, result);
    elements.registerForm.reset();
    elements.loginForm.reset();
    elements.authStatus.textContent = `Signed in as ${result.session?.user?.displayName || result.session?.user?.username}.`;
    renderApp();
  } catch (error) {
    elements.authStatus.textContent = error.message;
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(elements.loginForm));
  const validation = validateLoginInput(payload);
  setFieldErrors(elements.loginForm, validation.errors, {
    username: "login-username",
    password: "login-password",
  });

  if (!validation.isValid) {
    elements.authStatus.textContent = Object.values(validation.errors).join(" ");
    return;
  }

  try {
    const result = await requestJson("/api/session/login", {
      method: "POST",
      body: JSON.stringify(validation.normalized),
    });
    applyBootstrapPayload(state, result);
    elements.loginForm.reset();
    elements.authStatus.textContent = `Signed in as ${result.session?.user?.displayName || result.session?.user?.username}.`;
    renderApp();
  } catch (error) {
    elements.authStatus.textContent = error.message;
  }
}

async function handleAccountClick(event) {
  const target = event.target.closest("[data-logout-session]");
  if (!target) {
    return;
  }

  try {
    const payload = await requestJson("/api/session/logout", { method: "POST" });
    applyBootstrapPayload(state, payload);
    elements.authStatus.textContent = "Signed out.";
    renderApp();
  } catch (error) {
    elements.authStatus.textContent = error.message;
  }
}

async function handleWatchlistSubmit(event) {
  event.preventDefault();
  if (!isAuthenticated(state)) {
    elements.authStatus.textContent = "Sign in to save a watchlist.";
    return;
  }

  const payload = buildWatchlistPayload(elements.watchlistForm);
  const validation = validateWatchTarget(payload);
  setFieldErrors(elements.watchlistForm, validation.errors, {
    label: "watch-label",
    wallet: "watch-wallet",
    thesis: "watch-thesis",
    minSizeUsd: "watch-min-size",
    minForecastScore: "watch-min-score",
    alertMode: "watch-alert-mode",
    marketCategory: "watch-market-category",
    sideFilter: "watch-side-filter",
    recentHours: "watch-recent-hours",
  });

  if (!validation.isValid) {
    elements.watchlistStatus.textContent = Object.values(validation.errors).join(" ");
    return;
  }

  try {
    const result = await requestJson("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({
        label: payload.label,
        wallet: payload.wallet,
        thesis: payload.thesis,
        prefs: validation.prefs,
      }),
    });
    state.watchlist = result.watchlist || [];
    state.alerts = result.alerts || state.alerts;
    state.notificationDeliveries = result.notificationDeliveries || state.notificationDeliveries;
    resetWatchlistForm(elements.watchlistForm);
    elements.watchlistStatus.textContent = "Watchlist updated.";
    renderApp();
  } catch (error) {
    if (handleUnauthorized(error, elements.authStatus)) {
      return;
    }
    elements.watchlistStatus.textContent = error.message;
  }
}

async function handleWatchlistClick(event) {
  const target = event.target.closest("[data-remove-watch]");
  if (!target) {
    return;
  }

  try {
    const result = await requestJson(
      `/api/watchlist/${encodeURIComponent(target.getAttribute("data-remove-watch"))}`,
      {
        method: "DELETE",
      }
    );
    state.watchlist = result.watchlist || [];
    state.alerts = result.alerts || state.alerts;
    state.notificationDeliveries = result.notificationDeliveries || state.notificationDeliveries;
    elements.watchlistStatus.textContent = "Watchlist entry removed.";
    renderApp();
  } catch (error) {
    if (handleUnauthorized(error, elements.authStatus)) {
      return;
    }
    elements.watchlistStatus.textContent = error.message;
  }
}

async function handleNotificationSubmit(event) {
  event.preventDefault();
  if (!isAuthenticated(state)) {
    elements.authStatus.textContent = "Sign in to save notification channels.";
    return;
  }

  const payload = buildNotificationPayload(elements.notificationForm);
  const validation = validateNotificationChannel(payload);
  setFieldErrors(elements.notificationForm, validation.errors, {
    label: "notification-label",
    type: "notification-type",
    webhookUrl: "notification-webhook-url",
    botToken: "notification-bot-token",
    chatId: "notification-chat-id",
  });

  if (!validation.isValid) {
    elements.notificationStatus.textContent = Object.values(validation.errors).join(" ");
    return;
  }

  try {
    const result = await requestJson("/api/notification-channels", {
      method: "POST",
      body: JSON.stringify({
        ...validation.channel,
        webhookUrl: validation.channel.config.webhookUrl,
        botToken: validation.channel.config.botToken,
        chatId: validation.channel.config.chatId,
      }),
    });
    state.notificationChannels = result.channels || [];
    state.notificationDeliveries = result.deliveries || state.notificationDeliveries;
    resetNotificationForm(elements.notificationForm);
    elements.notificationStatus.textContent = "Channel saved.";
    renderApp();
  } catch (error) {
    if (handleUnauthorized(error, elements.authStatus)) {
      return;
    }
    elements.notificationStatus.textContent = error.message;
  }
}

async function handleNotificationClick(event) {
  const testTarget = event.target.closest("[data-test-channel]");
  if (testTarget) {
    try {
      const result = await requestJson(
        `/api/notification-channels/${encodeURIComponent(testTarget.getAttribute("data-test-channel"))}/test`,
        {
          method: "POST",
        }
      );
      state.notificationChannels = state.notificationChannels.map((channel) =>
        channel.id === result.channel?.id ? result.channel : channel
      );
      state.notificationDeliveries = result.deliveries || state.notificationDeliveries;
      elements.notificationStatus.textContent = "Channel test finished.";
      renderApp();
    } catch (error) {
      if (handleUnauthorized(error, elements.authStatus)) {
        return;
      }
      elements.notificationStatus.textContent = error.message;
    }
    return;
  }

  const removeTarget = event.target.closest("[data-remove-channel]");
  if (!removeTarget) {
    return;
  }

  try {
    const result = await requestJson(
      `/api/notification-channels/${encodeURIComponent(removeTarget.getAttribute("data-remove-channel"))}`,
      {
        method: "DELETE",
      }
    );
    state.notificationChannels = result.channels || [];
    state.notificationDeliveries = result.deliveries || state.notificationDeliveries;
    elements.notificationStatus.textContent = "Channel removed.";
    renderApp();
  } catch (error) {
    if (handleUnauthorized(error, elements.authStatus)) {
      return;
    }
    elements.notificationStatus.textContent = error.message;
  }
}

function handleSimulationSubmit(event) {
  event.preventDefault();
  const { validation } = validateSimulationForm({ announceErrors: true });

  if (!validation) {
    return;
  }

  if (!validation.isValid) {
    return;
  }

  resetSimulationState(state);
  if (!isAuthenticated(state)) {
    elements.simulationStatus.textContent = "Anonymous mode only computes a preview.";
    renderApp();
    loadSimulationFromServer(validation.normalized, { announce: true }).catch(() => {});
    return;
  }

  elements.simulationStatus.textContent = "Saving backtest...";
  renderApp();
  saveBacktestRun(validation.normalized).catch(() => {});
}

function validateSimulationForm({ announceErrors = false } = {}) {
  const payload = getSimulationPayloadFromForm(elements.simulationForm);
  const validation = validateSimulationInput(payload, getTraders(state));
  setFieldErrors(elements.simulationForm, validation.errors, {
    traderId: "simulation-trader",
    latencyMinutes: "simulation-latency",
    budget: "simulation-budget",
    mode: "simulation-mode",
    minTradeUsd: "simulation-min-trade-usd",
    startDate: "simulation-start-date",
    endDate: "simulation-end-date",
  });

  if (!validation.isValid) {
    if (announceErrors) {
      elements.simulationStatus.textContent = Object.values(validation.errors).join(" ");
    }
    return { payload, validation };
  }

  if (announceErrors && elements.simulationStatus.textContent) {
    elements.simulationStatus.textContent = "";
  }

  return { payload, validation };
}

async function handleSyncClick() {
  if (state.syncPending) {
    return;
  }

  closeMenu();
  state.syncPending = true;
  renderApp();

  try {
    const payload = await requestJson("/api/sync", { method: "POST" });
    applyBootstrapPayload(state, payload);
    elements.simulationStatus.textContent = "Sync finished.";
    if (state.selectedMarketSlug) {
      await loadMarketDetail(state.selectedMarketSlug);
    } else {
      renderApp();
    }
  } catch (error) {
    elements.simulationStatus.textContent = `Sync failed: ${error.message}`;
  } finally {
    state.syncPending = false;
    renderApp();
  }
}

async function handleAlertsReadAll() {
  if (!isAuthenticated(state)) {
    elements.authStatus.textContent = "Sign in to mark personal alerts as read.";
    return;
  }

  try {
    const payload = await requestJson("/api/alerts/read-all", { method: "POST" });
    state.alerts = payload.items || [];
    renderApp();
  } catch (error) {
    if (handleUnauthorized(error, elements.authStatus)) {
      return;
    }
    elements.simulationStatus.textContent = error.message;
  }
}

function bindScrollButtons() {
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.scrollTarget);
      closeMenu();
      target?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  });
}

function bindDelegatedClicks() {
  elements.backtestHistory.addEventListener("click", (event) => {
    const target = event.target.closest("[data-backtest-id]");
    if (target) {
      loadStoredBacktest(target.getAttribute("data-backtest-id"));
    }
  });

  [elements.marketGrid, elements.signalFeed, elements.alertsFeed].forEach((container) => {
    container.addEventListener("click", (event) => {
      const target = event.target.closest("[data-market-slug]");
      if (target) {
        closeMenu();
        loadMarketDetail(target.getAttribute("data-market-slug"), { scroll: true });
      }
    });
  });
}

function init() {
  initializeTheme();
  initializeMobileMenu();
  initializeDatePickers(elements.simulationForm);
  bindScrollButtons();
  bindDelegatedClicks();
  renderApp();
  loadBootstrap();

  elements.filterForm.addEventListener("submit", (event) => event.preventDefault());
  const handleFilterChange = () => {
    syncFilterStateFromForm(elements.filterForm, state);
    renderApp();
  };
  elements.filterForm.addEventListener("input", handleFilterChange);
  elements.filterForm.addEventListener("change", handleFilterChange);

  elements.registerForm.addEventListener("submit", handleRegisterSubmit);
  elements.loginForm.addEventListener("submit", handleLoginSubmit);
  elements.accountSection.addEventListener("click", handleAccountClick);
  elements.watchlistForm.addEventListener("submit", handleWatchlistSubmit);
  elements.watchlist.addEventListener("click", handleWatchlistClick);
  elements.notificationForm.addEventListener("submit", handleNotificationSubmit);
  elements.notificationChannels.addEventListener("click", handleNotificationClick);
  elements.simulationForm.addEventListener("submit", handleSimulationSubmit);
  elements.simulationForm.addEventListener("change", () => {
    resetSimulationState(state);
    const { validation } = validateSimulationForm({ announceErrors: true });
    renderApp();

    if (!validation?.isValid) {
      return;
    }

    loadSimulationFromServer(validation.normalized).catch(() => {});
  });
  elements.syncButton.addEventListener("click", handleSyncClick);
  elements.readAlertsButton.addEventListener("click", handleAlertsReadAll);
  elements.themeToggle?.addEventListener("click", toggleTheme);
  elements.menuToggle?.addEventListener("click", () => {
    const isExpanded = elements.menuToggle.getAttribute("aria-expanded") === "true";
    setMenuOpen(!isExpanded);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  window.setInterval(() => {
    if (!state.syncPending) {
      loadBootstrap();
    }
  }, bootstrapRefreshMs);
}

init();
