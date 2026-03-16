export function deriveMarketsFromSnapshot(snapshot) {
  const traderMap = new Map((snapshot.traders || []).map((trader) => [trader.id, trader]));
  const contextMap = new Map((snapshot.marketContexts || []).map((context) => [context.slug, context]));
  const buckets = new Map();

  for (const signal of snapshot.signalFeed || []) {
    const slug = signal.marketSlug || `${signal.market || "market"}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (!buckets.has(slug)) {
      buckets.set(slug, {
        slug,
        title: signal.market,
        latestTimestamp: signal.timestamp,
        latestTimestampMs: Number(signal.timestampMs || 0),
        signalCount: 0,
        traderCount: 0,
        totalSizeUsd: 0,
        categories: [],
        consensusBias: "Mixed positioning",
        topTraders: [],
        recentSignals: [],
      });
    }

    const bucket = buckets.get(slug);
    bucket.signalCount += 1;
    bucket.totalSizeUsd += Number(signal.sizeUsd || `${signal.size || "0"}`.replace(/[^0-9.-]/g, "")) || 0;
    bucket.recentSignals.push(signal);

    const trader = traderMap.get(signal.traderId);
    if (trader && !bucket.topTraders.some((item) => item.id === trader.id)) {
      bucket.topTraders.push(trader);
    }
  }

  return [...buckets.values()].map((bucket) => {
    const context = contextMap.get(bucket.slug);
    return {
      ...bucket,
      traderCount: bucket.topTraders.length,
      topTraders: bucket.topTraders.slice(0, 3),
      linkedAsset: context?.asset || "",
      currentPrice: context?.currentPrice || 0,
      priceChangePct: context?.priceChangePct || 0,
      priceHistory: context?.priceHistory || [],
    };
  });
}
