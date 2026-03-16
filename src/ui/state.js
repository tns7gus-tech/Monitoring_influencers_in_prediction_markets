import { createFallbackSnapshot, normalizeSnapshot } from "../snapshot.js";
import { deriveMarketsFromSnapshot } from "./markets.js";

export function createInitialState() {
  return {
    query: "",
    category: "all",
    window: 30,
    session: null,
    watchlist: [],
    alerts: [],
    markets: [],
    recentBacktests: [],
    notificationChannels: [],
    notificationDeliveries: [],
    selectedMarketSlug: "",
    marketDetail: null,
    dataset: createFallbackSnapshot(),
    syncPending: false,
    syncStatus: null,
    simulationPending: false,
    pendingSimulationKey: "",
    simulationKey: "",
    simulationResult: null,
    simulationContext: null,
    simulationSource: "local",
  };
}

export function getTraders(state) {
  return state.dataset.traders || [];
}

export function isAuthenticated(state) {
  return Boolean(state.session?.user?.id);
}

export function clearPersonalizedState(state) {
  state.watchlist = [];
  state.recentBacktests = [];
  state.notificationChannels = [];
  state.notificationDeliveries = [];
}

export function resetSimulationState(state) {
  state.simulationKey = "";
  state.simulationResult = null;
  state.simulationContext = null;
  state.simulationSource = "local";
}

export function buildFallbackBootstrapPayload(state) {
  const fallbackSnapshot = createFallbackSnapshot();
  return {
    session: null,
    snapshot: fallbackSnapshot,
    watchlist: [],
    alerts: [],
    markets: deriveMarketsFromSnapshot(fallbackSnapshot),
    recentBacktests: [],
    notificationChannels: [],
    notificationDeliveries: [],
    syncStatus: state.syncStatus,
  };
}

export function applyBootstrapPayload(state, payload) {
  const previousGeneratedAt = state.dataset.generatedAt;
  state.session = payload.session || null;
  state.dataset = normalizeSnapshot(payload.snapshot || createFallbackSnapshot());
  state.watchlist = payload.watchlist || [];
  state.alerts = payload.alerts || [];
  state.markets = payload.markets?.length ? payload.markets : deriveMarketsFromSnapshot(state.dataset);
  state.recentBacktests = payload.recentBacktests || [];
  state.notificationChannels = payload.notificationChannels || [];
  state.notificationDeliveries = payload.notificationDeliveries || [];
  state.syncStatus = payload.syncStatus || state.syncStatus;

  if (!state.session) {
    clearPersonalizedState(state);
  }

  if (state.dataset.generatedAt !== previousGeneratedAt) {
    resetSimulationState(state);
  }

  const preferredSlug = state.selectedMarketSlug;
  const firstSlug = payload.marketDetail?.slug || state.markets[0]?.slug || "";
  state.selectedMarketSlug = state.markets.some((market) => market.slug === preferredSlug)
    ? preferredSlug
    : firstSlug;
  state.marketDetail =
    payload.marketDetail && payload.marketDetail.slug === state.selectedMarketSlug
      ? payload.marketDetail
      : state.markets.find((market) => market.slug === state.selectedMarketSlug) || null;
}
