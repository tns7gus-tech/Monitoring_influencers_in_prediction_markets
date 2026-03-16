import { formatPrice } from "./formatters.js";

function getCurvePoints(values, width, height, padding) {
  if (!values.length) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const xStep = values.length === 1 ? 0 : (width - padding * 2) / (values.length - 1);
  const yRange = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = padding + index * xStep;
      const normalizedY = (value - min) / yRange;
      const y = height - padding - normalizedY * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function createSparkline(curve) {
  const safeCurve = Array.isArray(curve) && curve.length ? curve : [0, 0, 0, 0];
  const points = getCurvePoints(safeCurve, 180, 80, 10);

  return `
    <svg viewBox="0 0 180 80" role="img" aria-label="PnL curve">
      <polyline fill="none" stroke="currentColor" stroke-width="3" points="${points}" />
    </svg>
  `;
}

export function createMarketChart(points, title) {
  const safePoints = Array.isArray(points) ? points : [];
  if (safePoints.length < 2) {
    return `
      <div class="chart-empty" role="img" aria-label="${title} price history unavailable">
        Price history is not available yet.
      </div>
    `;
  }

  const values = safePoints.map((point) => Number(point.price || 0));
  const polyline = getCurvePoints(values, 420, 160, 14);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = safePoints[0];
  const last = safePoints[safePoints.length - 1];

  return `
    <div class="chart-shell">
      <div class="chart-header">
        <span>1w price</span>
        <span>${new Date(last.timestampMs).toLocaleString("en-US")}</span>
      </div>
      <svg viewBox="0 0 420 160" role="img" aria-label="${title} one week price chart">
        <line class="chart-gridline" x1="14" y1="20" x2="406" y2="20"></line>
        <line class="chart-gridline" x1="14" y1="80" x2="406" y2="80"></line>
        <line class="chart-gridline" x1="14" y1="140" x2="406" y2="140"></line>
        <polyline class="chart-line" fill="none" points="${polyline}"></polyline>
      </svg>
      <div class="chart-summary">
        <span>Low ${formatPrice(min)}</span>
        <span>High ${formatPrice(max)}</span>
        <span>Start ${new Date(first.timestampMs).toLocaleDateString("en-US")}</span>
      </div>
    </div>
  `;
}
