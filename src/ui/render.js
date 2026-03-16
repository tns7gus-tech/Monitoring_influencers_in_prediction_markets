import {
  buildCategoryOptions,
  filterTraders,
  getTraderById,
  normalizeWatchPrefs,
  rankTraders,
  simulateCopyStrategy,
  summarizeDashboard,
} from "../metrics.js";
import { createMarketChart, createSparkline } from "./charts.js";
import {
  formatBacktestWindow,
  formatCurrency,
  formatDeliveryStatusLabel,
  formatNotificationTypeLabel,
  formatPercent,
  formatPrice,
  formatSimulationModeLabel,
  formatSyncInterval,
  formatWatchPrefsSummary,
  truncateWallet,
} from "./formatters.js";
import { buildSimulationKey, getSimulationPayloadFromForm, setFormDisabled } from "./forms.js";
import { getTraders, isAuthenticated, resetSimulationState } from "./state.js";

function buildLockedListItem(className, title, message) {
  return `
    <li class="${className} empty-state">
      <div class="locked-state">
        <h3>${title}</h3>
        <p>${message}</p>
      </div>
    </li>
  `;
}

function renderAuthPanel(state, elements) {
  if (isAuthenticated(state)) {
    elements.authForms.hidden = true;
    elements.authSession.innerHTML = `
      <article class="account-card">
        <div>
          <p class="eyebrow">Workspace active</p>
          <h3>${state.session.user.displayName}</h3>
          <p class="account-meta">@${state.session.user.username} | expires ${new Date(
            state.session.expiresAt
          ).toLocaleString("en-US")}</p>
        </div>
        <button class="ghost-button small" type="button" data-logout-session>Sign out</button>
      </article>
    `;
  } else {
    elements.authForms.hidden = false;
    elements.authSession.innerHTML = `
      <div class="locked-state">
        <h3>Create a workspace to save and sell repeatable signal workflows</h3>
        <p>Keep watchlists, channel routing, and stored backtests in one place before sharing them with clients or members.</p>
      </div>
    `;
  }

  setFormDisabled(elements.watchlistForm, !isAuthenticated(state));
  setFormDisabled(elements.notificationForm, !isAuthenticated(state));
  elements.simulationSubmit.textContent = isAuthenticated(state) ? "Run and save backtest" : "Run backtest preview";
}

function renderSnapshotMeta(state, elements) {
  const generatedAt = state.dataset.generatedAt
    ? new Date(state.dataset.generatedAt).toLocaleString("en-US")
    : "Unknown";
  const sourceLabel = state.dataset.source === "live" ? "Live" : "Fallback";
  const syncLabel = state.syncPending
    ? "Sync in progress"
    : `${sourceLabel} | updated ${generatedAt} | auto ${formatSyncInterval(state.syncStatus?.intervalMs)}`;

  elements.snapshotMeta.textContent = syncLabel;
  elements.syncButton.disabled = state.syncPending;
  elements.readAlertsButton.disabled = !isAuthenticated(state) || state.alerts.length === 0;
  elements.syncButton.setAttribute("aria-busy", state.syncPending ? "true" : "false");
}

function renderCategoryOptions(state, elements) {
  const selected = state.category;
  const options = buildCategoryOptions(getTraders(state))
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");
  elements.categoryFilter.innerHTML = `<option value="all">All</option>${options}`;
  elements.categoryFilter.value = selected;
}

function renderSimulationOptions(state, elements) {
  const traders = getTraders(state);
  const previousValue = elements.simulationTrader.value;
  elements.simulationTrader.innerHTML = traders
    .map((trader) => `<option value="${trader.id}">${trader.alias}</option>`)
    .join("");

  if (!traders.length) {
    resetSimulationState(state);
    return;
  }

  const nextValue = traders.some((trader) => trader.id === previousValue) ? previousValue : traders[0].id;
  if (nextValue !== previousValue) {
    resetSimulationState(state);
  }

  elements.simulationTrader.value = nextValue;
}

function renderHero(state, elements, summary) {
  if (!summary.leader) {
    elements.heroGrid.innerHTML = `
      <article class="stat-card empty-state">
        <span class="stat-label">No signal match</span>
        <strong>0</strong>
        <span class="stat-meta">Adjust filters to inspect more traders.</span>
      </article>
    `;
    return;
  }

  const topScenario = summary.leader.backtestSummary?.bestScenario;
  const topSimulation = topScenario?.eventCount
    ? topScenario
    : simulateCopyStrategy(summary.leader, {
        traderId: summary.leader.id,
        latencyMinutes: 5,
        budget: 1000,
        mode: "follow_exit",
      });

  elements.heroGrid.innerHTML = `
    <article class="stat-card">
      <span class="stat-label">Ranked traders</span>
      <strong>${summary.trackedTraders}</strong>
      <span class="stat-meta">Current monitored wallet universe</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">${state.window}d avg accuracy</span>
      <strong>${formatPercent(summary.averageAccuracy)}</strong>
      <span class="stat-meta">Forecast-first ranking baseline</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">Mapped markets</span>
      <strong>${state.markets.length}</strong>
      <span class="stat-meta">Signals, crowding, and price-path coverage</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">Visible alerts</span>
      <strong>${state.alerts.length}</strong>
      <span class="stat-meta">${isAuthenticated(state) ? "Personal feed is active" : "Public feed preview"}</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">Top backtest ROI</span>
      <strong>${formatPercent(topSimulation.roi)}</strong>
      <span class="stat-meta">${topScenario?.eventCount ? `${topScenario.eventCount} trades in sample` : "Snapshot estimate"}</span>
    </article>
  `;
}

function renderLeaderboard(elements, ranked) {
  if (!ranked.length) {
    elements.leaderboardCards.innerHTML = `
      <article class="leader-card empty-state">
        <h3>No traders match the current filter.</h3>
        <p>Try a different keyword or category.</p>
      </article>
    `;
    elements.leaderboardBody.innerHTML = `
      <tr>
        <td colspan="7">No traders match the current filter.</td>
      </tr>
    `;
    return;
  }

  elements.leaderboardCards.innerHTML = ranked
    .slice(0, 4)
    .map(
      (trader, index) => `
        <article class="leader-card">
          <div class="leader-header">
            <span class="leader-rank">#${index + 1}</span>
            <div>
              <h3>${trader.alias}</h3>
              <p>${truncateWallet(trader.wallet)}</p>
            </div>
          </div>
          <dl class="leader-metrics">
            <div><dt>Score</dt><dd>${formatPercent(trader.forecastScore)}</dd></div>
            <div><dt>90d accuracy</dt><dd>${formatPercent(trader.forecastAccuracy90d)}</dd></div>
            <div><dt>Reliability</dt><dd>${formatPercent(trader.reliabilityScore)}</dd></div>
          </dl>
          <p class="leader-signal">${trader.recentSignal.action} | ${trader.recentSignal.market} | ${trader.recentSignal.side}</p>
        </article>
      `
    )
    .join("");

  elements.leaderboardBody.innerHTML = ranked
    .map(
      (trader, index) => `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${trader.alias}</strong><span class="table-sub">${truncateWallet(trader.wallet)}</span></td>
          <td>${formatPercent(trader.forecastScore)}</td>
          <td>${formatPercent(trader.forecastAccuracy90d)}</td>
          <td>${formatPercent(trader.reliabilityScore)}</td>
          <td>${trader.openPositions} / ${formatCurrency(trader.openExposure)}</td>
          <td>${trader.recentSignal.action} | ${trader.recentSignal.market}</td>
        </tr>
      `
    )
    .join("");
}

function renderAlerts(state, elements) {
  if (!state.alerts.length) {
    elements.alertsFeed.innerHTML = `
      <li class="alert-item empty-state">
        <h3>No alerts available.</h3>
        <p>${isAuthenticated(state) ? "Add a watchlist or wait for the next sync." : "Sign in for a personal alert feed."}</p>
      </li>
    `;
    return;
  }

  elements.alertsFeed.innerHTML = state.alerts
    .map(
      (alert) => `
        <li>
          <button class="alert-item ${alert.readAt ? "is-read" : ""}" type="button" ${
            alert.marketSlug ? `data-market-slug="${alert.marketSlug}"` : ""
          }>
            <div class="alert-meta">
              <span class="alert-tag ${alert.severity || "medium"}">${alert.type}</span>
              <span>${new Date(alert.createdAt).toLocaleString("en-US")}</span>
            </div>
            <h3>${alert.title}</h3>
            <p>${alert.message}</p>
          </button>
        </li>
      `
    )
    .join("");
}

function renderSignals(state, elements, ranked) {
  const visibleTraderIds = new Set(ranked.map((trader) => trader.id));
  const source = (state.dataset.signalFeed || []).filter(
    (signal) => visibleTraderIds.size === 0 || visibleTraderIds.has(signal.traderId)
  );

  if (!source.length) {
    elements.signalFeed.innerHTML = `
      <li class="signal-item empty-state">
        <h3>No recent signals.</h3>
        <p>Run a sync and try again.</p>
      </li>
    `;
    return;
  }

  elements.signalFeed.innerHTML = source
    .map((signal) => `
      <li>
        <button class="signal-item signal-button" type="button" data-market-slug="${signal.marketSlug || ""}">
          <div class="signal-meta">
            <span class="signal-time">${signal.timestamp}</span>
            <span class="signal-size">${signal.size}</span>
          </div>
          <h3>${signal.traderAlias || signal.traderId}</h3>
          <p class="signal-headline">${signal.action} | ${signal.market} | ${signal.side}</p>
          <p class="signal-note">${signal.note}</p>
        </button>
      </li>
    `)
    .join("");
}

function renderMarketRadar(state, elements) {
  if (!state.markets.length) {
    elements.marketGrid.innerHTML = `
      <article class="market-card empty-state">
        <h3>No markets available.</h3>
        <p>Run a sync and try again.</p>
      </article>
    `;
    return;
  }

  elements.marketGrid.innerHTML = state.markets
    .map(
      (market) => `
        <button class="market-card market-button ${market.slug === state.selectedMarketSlug ? "is-selected" : ""}" type="button" data-market-slug="${market.slug}">
          <div class="market-topline">
            <span>${market.title}</span>
            <span>${market.signalCount} signals</span>
          </div>
          <p class="market-consensus">${market.consensusBias}</p>
          <p class="market-divergence">${market.traderCount} traders | ${formatCurrency(market.totalSizeUsd)}</p>
          <p class="market-price ${market.priceChangePct >= 0 ? "positive" : "negative"}">
            ${market.currentPrice ? `${formatPrice(market.currentPrice)} | ${formatPercent(market.priceChangePct)}` : "Price history pending"}
          </p>
          <p class="market-category">${(market.categories || []).join(" | ") || "General"}</p>
        </button>
      `
    )
    .join("");
}

function renderMarketDetail(state, elements) {
  const market = state.marketDetail;
  if (!market) {
    elements.marketDetail.innerHTML = `
      <article class="empty-state market-card">
        <h3>No market selected.</h3>
        <p>Select a market card or a signal to inspect details.</p>
      </article>
    `;
    return;
  }

  elements.marketDetail.innerHTML = `
    <article class="market-detail-card">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">Selected market</p>
          <h3>${market.title}</h3>
        </div>
        <p class="section-note">${market.consensusBias || "Mixed positioning"}</p>
      </div>
      <div class="detail-grid">
        <article class="detail-stat"><span>Tracked traders</span><strong>${market.traderCount || 0}</strong></article>
        <article class="detail-stat"><span>Signals</span><strong>${market.signalCount || 0}</strong></article>
        <article class="detail-stat"><span>Tracked size</span><strong>${formatCurrency(market.totalSizeUsd || 0)}</strong></article>
      </div>
      <section class="market-chart-panel">
        <div class="chart-stats">
          <div><span>Current price</span><strong>${market.currentPrice ? formatPrice(market.currentPrice) : "-"}</strong></div>
          <div><span>1w change</span><strong class="${market.priceChangePct >= 0 ? "positive" : "negative"}">${formatPercent(market.priceChangePct || 0)}</strong></div>
          <div><span>Linked asset</span><strong>${market.linkedAsset ? truncateWallet(market.linkedAsset) : "Unknown"}</strong></div>
        </div>
        ${createMarketChart(market.priceHistory || [], market.title)}
      </section>
      <div class="detail-columns">
        <section>
          <h4>Tracked traders</h4>
          <ul class="detail-trader-list">
            ${(market.topTraders || [])
              .map((trader) => `<li><strong>${trader.alias}</strong><span>${formatPercent(trader.forecastScore || 0)} | ${formatPercent(trader.forecastAccuracy90d || 0)}</span></li>`)
              .join("") || "<li>No trader details.</li>"}
          </ul>
        </section>
        <section>
          <h4>Recent signals</h4>
          <ul class="detail-signal-list">
            ${(market.recentSignals || [])
              .slice(0, 6)
              .map((signal) => `<li><strong>${signal.traderAlias || signal.traderId}</strong><span>${signal.action} | ${signal.side} | ${signal.size}</span><p>${signal.note}</p></li>`)
              .join("") || "<li>No signals.</li>"}
          </ul>
        </section>
      </div>
    </article>
  `;
}

function renderWatchlist(state, elements) {
  if (!isAuthenticated(state)) {
    elements.watchlist.innerHTML = buildLockedListItem(
      "watch-item",
      "Sign in to save a watchlist",
      "Watchlist rules, alerts, and notification routing are stored per user."
    );
    return;
  }

  if (!state.watchlist.length) {
    elements.watchlist.innerHTML = `
      <li class="watch-item empty-state">
        <div>
          <h3>Your watchlist is empty.</h3>
          <p>Add a wallet to start generating personal alerts.</p>
        </div>
      </li>
    `;
    return;
  }

  elements.watchlist.innerHTML = state.watchlist
    .map((item) => {
      const prefs = normalizeWatchPrefs(item.prefs || {});
      return `
        <li class="watch-item">
          <div>
            <h3>${item.label}</h3>
            <p>${truncateWallet(item.wallet)}</p>
            <p class="watch-thesis">${item.thesis}</p>
            <p class="watch-prefs">${formatWatchPrefsSummary(prefs)}</p>
          </div>
          <button class="ghost-button small" type="button" data-remove-watch="${item.wallet}">Delete</button>
        </li>
      `;
    })
    .join("");
}

function renderNotificationChannels(state, elements) {
  if (!isAuthenticated(state)) {
    elements.notificationChannels.innerHTML = buildLockedListItem(
      "channel-item",
      "Sign in to manage notification channels",
      "Channel configs and delivery tests are scoped to the signed-in user."
    );
    return;
  }

  if (!state.notificationChannels.length) {
    elements.notificationChannels.innerHTML = `
      <li class="channel-item empty-state">
        <div>
          <h3>No channels saved.</h3>
          <p>Add a Discord, Telegram, webhook, or log-only channel.</p>
        </div>
      </li>
    `;
    return;
  }

  elements.notificationChannels.innerHTML = state.notificationChannels
    .map(
      (channel) => `
        <li class="channel-item">
          <div>
            <h3>${channel.label}</h3>
            <p>${formatNotificationTypeLabel(channel.type)} | ${channel.enabled ? "Enabled" : "Disabled"}</p>
            <p class="watch-prefs">Last status ${formatDeliveryStatusLabel(channel.lastStatus)}${channel.lastAttemptAt ? ` | ${new Date(channel.lastAttemptAt).toLocaleString("en-US")}` : ""}</p>
            ${channel.lastError ? `<p class="field-hint">${channel.lastError}</p>` : ""}
          </div>
          <div class="channel-actions">
            <button class="ghost-button small" type="button" data-test-channel="${channel.id}">Test</button>
            <button class="ghost-button small" type="button" data-remove-channel="${channel.id}">Delete</button>
          </div>
        </li>
      `
    )
    .join("");
}

function renderNotificationDeliveries(state, elements) {
  if (!isAuthenticated(state)) {
    elements.notificationDeliveries.innerHTML = buildLockedListItem(
      "delivery-item",
      "Sign in to inspect delivery logs",
      "Queued, sent, and failed deliveries are stored per user session."
    );
    return;
  }

  if (!state.notificationDeliveries.length) {
    elements.notificationDeliveries.innerHTML = `
      <li class="delivery-item empty-state">
        <div>
          <h3>No delivery log yet.</h3>
          <p>Run a channel test or wait for the next alert batch.</p>
        </div>
      </li>
    `;
    return;
  }

  elements.notificationDeliveries.innerHTML = state.notificationDeliveries
    .slice(0, 8)
    .map(
      (delivery) => `
        <li class="delivery-item">
          <div class="delivery-meta">
            <strong>${delivery.channel.label}</strong>
            <span class="alert-tag ${delivery.status === "sent" ? "low" : delivery.status === "failed" ? "high" : "medium"}">${formatDeliveryStatusLabel(delivery.status)}</span>
          </div>
          <p>${delivery.title}</p>
          <p class="field-hint">${delivery.message || "No message"}</p>
          <p class="watch-prefs">${delivery.kind === "test" ? "Channel test" : delivery.alertType} | ${new Date(delivery.createdAt).toLocaleString("en-US")}</p>
        </li>
      `
    )
    .join("");
}

function renderSimulationCard(trader, result, sourceLabel, input = {}, context = null) {
  return `
    <article class="simulation-card">
      <div class="simulation-header">
        <div>
          <p class="eyebrow">Projected outcome</p>
          <h3>${trader.alias}</h3>
        </div>
        <strong class="${result.roi >= 0 ? "positive" : "negative"}">${formatPercent(result.roi)}</strong>
      </div>
      <div class="simulation-metrics">
        <div><span>Net PnL</span><strong>${formatCurrency(result.netPnl)}</strong></div>
        <div><span>Win rate</span><strong>${formatPercent(result.winProbability)}</strong></div>
        <div><span>Max drawdown</span><strong>${formatPercent(result.maxDrawdown)}</strong></div>
        <div><span>Expectancy</span><strong>${formatCurrency(result.expectancy)}</strong></div>
      </div>
      <div class="curve-panel">${createSparkline(result.curve)}</div>
      <div class="simulation-note-grid">
        <p class="simulation-note">${sourceLabel} | ${result.eventCount ? `${result.eventCount} trades` : "Estimated"} | ${formatSimulationModeLabel(result.mode || input.mode)} | ${result.latencyMinutes || input.latencyMinutes || 0}m latency</p>
        <p class="simulation-note">Window ${formatBacktestWindow(input, result)} | Min trade ${formatCurrency(input.minTradeUsd || result.minTradeUsd || 0)}</p>
        <p class="simulation-note">${context?.createdAt ? `Saved ${new Date(context.createdAt).toLocaleString("en-US")}` : "Preview mode"}</p>
      </div>
    </article>
  `;
}

function renderBacktestHistory(state, elements) {
  if (!isAuthenticated(state)) {
    elements.backtestHistory.innerHTML = buildLockedListItem(
      "history-item",
      "Sign in to compare saved backtests",
      "Anonymous usage only computes a preview and does not persist runs."
    );
    return;
  }

  if (!state.recentBacktests.length) {
    elements.backtestHistory.innerHTML = `
      <li class="history-item empty-state">
        <div>
          <h3>No stored backtests.</h3>
          <p>Save a run to compare it later.</p>
        </div>
      </li>
    `;
    return;
  }

  elements.backtestHistory.innerHTML = state.recentBacktests
    .map((run) => {
      const result = run.result || {};
      const input = run.input || {};
      const isSelected = state.simulationContext?.id === run.id && state.simulationSource === "stored";
      return `
        <li class="history-item">
          <button class="history-button ${isSelected ? "is-selected" : ""}" type="button" data-backtest-id="${run.id}">
            <div class="history-meta">
              <strong>${run.traderAlias}</strong>
              <span>${new Date(run.createdAt).toLocaleString("en-US")}</span>
            </div>
            <p class="history-stats">
              <span class="${result.roi >= 0 ? "positive" : "negative"}">${formatPercent(result.roi || 0)}</span>
              <span>${result.eventCount || 0} trades</span>
              <span>${formatCurrency(result.netPnl || 0)}</span>
            </p>
            <p class="history-note">${formatBacktestWindow(input, result)} | ${formatSimulationModeLabel(input.mode)} | ${input.latencyMinutes || 0}m</p>
          </button>
        </li>
      `;
    })
    .join("");
}

function renderSimulation(state, elements) {
  const traders = getTraders(state);
  const payload = getSimulationPayloadFromForm(elements.simulationForm);
  const key = buildSimulationKey(payload);
  const hasServerResult = state.simulationKey === key && state.simulationResult;
  const trader = getTraderById(traders, payload.traderId) || traders[0];

  elements.simulationOutput.setAttribute("aria-busy", state.simulationPending ? "true" : "false");

  if (!trader) {
    elements.simulationOutput.innerHTML = "";
    return;
  }

  const result = hasServerResult ? state.simulationResult : simulateCopyStrategy(trader, payload);
  const context = hasServerResult ? state.simulationContext : null;
  const sourceLabel = hasServerResult
    ? state.simulationSource === "stored"
      ? "Stored backtest"
      : "Server backtest"
    : "Local preview";

  elements.simulationOutput.innerHTML = renderSimulationCard(trader, result, sourceLabel, context?.input || payload, context);
}

export function renderDashboard({ state, elements }) {
  const filtered = filterTraders(getTraders(state), state.query, state.category);
  const ranked = rankTraders(filtered, state.window);
  const summary = summarizeDashboard(filtered, state.window);

  renderAuthPanel(state, elements);
  renderSnapshotMeta(state, elements);
  renderCategoryOptions(state, elements);
  renderSimulationOptions(state, elements);
  renderHero(state, elements, summary);
  renderLeaderboard(elements, ranked);
  renderAlerts(state, elements);
  renderSignals(state, elements, ranked);
  renderMarketRadar(state, elements);
  renderMarketDetail(state, elements);
  renderWatchlist(state, elements);
  renderNotificationChannels(state, elements);
  renderNotificationDeliveries(state, elements);
  renderBacktestHistory(state, elements);
  renderSimulation(state, elements);
}
