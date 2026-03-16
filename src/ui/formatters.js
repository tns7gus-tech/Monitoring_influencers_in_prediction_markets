import { formatCurrency, formatPercent } from "../metrics.js";

export { formatCurrency, formatPercent };

export function truncateWallet(wallet) {
  const value = `${wallet || ""}`;
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatPrice(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}c`;
}

export function formatSyncInterval(intervalMs) {
  if (!intervalMs) {
    return "manual";
  }

  const minutes = Math.max(1, Math.round(intervalMs / 60000));
  return `${minutes}m`;
}

export function formatAlertModeLabel(value) {
  if (value === "high_conviction") {
    return "High conviction only";
  }

  if (value === "new_entries_only") {
    return "New entries only";
  }

  return "All activity";
}

export function formatWatchCategoryLabel(value) {
  return value === "all" ? "All categories" : `${value} only`;
}

export function formatWatchSideLabel(value) {
  if (value === "yes_only") {
    return "YES only";
  }

  if (value === "no_only") {
    return "NO only";
  }

  return "Any side";
}

export function formatWatchPrefsSummary(prefs) {
  const rules = [
    `${formatCurrency(prefs.minSizeUsd)} min size`,
    `${formatPercent(prefs.minForecastScore)} min score`,
    formatAlertModeLabel(prefs.alertMode),
  ];

  if (prefs.marketCategory !== "all") {
    rules.push(formatWatchCategoryLabel(prefs.marketCategory));
  }

  if (prefs.sideFilter !== "all") {
    rules.push(formatWatchSideLabel(prefs.sideFilter));
  }

  if (prefs.recentHours > 0) {
    rules.push(`${prefs.recentHours}h lookback`);
  }

  return rules.join(" | ");
}

export function formatNotificationTypeLabel(value) {
  if (value === "discord_webhook") {
    return "Discord webhook";
  }

  if (value === "telegram_bot") {
    return "Telegram bot";
  }

  if (value === "generic_webhook") {
    return "Generic webhook";
  }

  return "Log only";
}

export function formatDeliveryStatusLabel(value) {
  if (value === "sent") {
    return "Sent";
  }

  if (value === "failed") {
    return "Failed";
  }

  return "Queued";
}

export function formatSimulationModeLabel(value) {
  return value === "hold_resolution" ? "Hold to resolution" : "Follow trader exits";
}

export function formatDateLabel(value) {
  if (!value) {
    return "N/A";
  }

  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-US");
}

export function formatBacktestWindow(input = {}, result = null) {
  if (input.startDate || input.endDate) {
    const start = input.startDate ? formatDateLabel(input.startDate) : "Start";
    const end = input.endDate ? formatDateLabel(input.endDate) : "Now";
    return `${start} - ${end}`;
  }

  if (result?.availableRange?.startDate && result?.availableRange?.endDate) {
    return `${formatDateLabel(result.availableRange.startDate)} - ${formatDateLabel(result.availableRange.endDate)}`;
  }

  return "Full history";
}
