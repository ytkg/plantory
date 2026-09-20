import { formatDateTime } from "./ui.js";

const CHART_COLORS = {
  axis: "#78716c",
  grid: "#e5f3e8",
  line: "#27613a",
};

export function chartTimeBounds(metrics, referenceTime) {
  const firstTimestamp = new Date(metrics[0]?.created_at).getTime();
  return Number.isFinite(firstTimestamp) ? { min: firstTimestamp, max: referenceTime } : { max: referenceTime };
}

export function renderMetricChart(canvas, { label, metrics, referenceTime, tooltipLabel, yScale }) {
  return new window.Chart(canvas, {
    type: "line",
    data: {
      datasets: [{
        label,
        data: metrics.map((metric) => ({
          x: new Date(metric.created_at).getTime(),
          y: metric.value,
          created_at: metric.created_at,
        })),
        borderColor: CHART_COLORS.line,
        borderWidth: 2,
        pointBackgroundColor: CHART_COLORS.line,
        pointRadius: metrics.length === 1 ? 3 : 2,
        pointHitRadius: 12,
        pointHoverRadius: 5,
        cubicInterpolationMode: "monotone",
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title(items) {
              return items[0]?.raw?.created_at ? formatDateTime(items[0].raw.created_at) : "日時不明";
            },
            label(context) {
              return tooltipLabel(context.parsed.y);
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          ...chartTimeBounds(metrics, referenceTime),
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.axis,
            maxTicksLimit: 5,
            callback: (value) => formatDateTime(new Date(Number(value)).toISOString()),
          },
        },
        y: {
          grid: { color: CHART_COLORS.grid },
          ticks: { color: CHART_COLORS.axis, callback: yScale.tickLabel },
          ...yScale.bounds,
        },
      },
    },
  });
}
