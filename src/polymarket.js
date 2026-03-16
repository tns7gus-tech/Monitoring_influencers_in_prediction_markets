const LEADERBOARD_BASE = "https://data-api.polymarket.com/v1/leaderboard";
const DATA_API_BASE = "https://data-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";

function buildUrl(base, params) {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, `${value}`);
    }
  });
  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Prediction-Alpha-Monitor/0.1",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Polymarket API ${response.status} for ${url}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

export async function fetchLeaderboard({ timePeriod = "DAY", orderBy = "PNL", limit = 10 } = {}) {
  return fetchJson(buildUrl(LEADERBOARD_BASE, { timePeriod, orderBy, limit }));
}

export async function fetchUserPositions(user, { limit = 25, sortBy = "CASHPNL", sortDirection = "DESC" } = {}) {
  return fetchJson(buildUrl(`${DATA_API_BASE}/positions`, { user, limit, sortBy, sortDirection }));
}

export async function fetchClosedPositions(
  user,
  { limit = 150, sortBy = "TIMESTAMP", sortDirection = "DESC" } = {}
) {
  return fetchJson(buildUrl(`${DATA_API_BASE}/closed-positions`, { user, limit, sortBy, sortDirection }));
}

export async function fetchUserActivity(user, { limit = 25 } = {}) {
  return fetchJson(buildUrl(`${DATA_API_BASE}/activity`, { user, limit }));
}

export async function fetchUserValue(user) {
  return fetchJson(buildUrl(`${DATA_API_BASE}/value`, { user }));
}

export async function fetchUserTrades(
  user,
  { limit = 60, offset = 0, takerOnly = true } = {}
) {
  return fetchJson(buildUrl(`${DATA_API_BASE}/trades`, { user, limit, offset, takerOnly }));
}

export async function fetchPricesHistory(
  asset,
  { interval = "1w", fidelity = 60 } = {}
) {
  return fetchJson(buildUrl(`${CLOB_BASE}/prices-history`, { market: asset, interval, fidelity }));
}
