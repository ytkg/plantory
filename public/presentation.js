const UNKNOWN_DATE_TIME = "日時不明";
const NUMBER_UNAVAILABLE = "—";

function parseDateTime(value) {
  if (typeof value !== "string" || value.trim() === "") return null;

  const withTimeSeparator = value.includes("T") ? value : value.replace(" ", "T");
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(withTimeSeparator);
  const normalized = hasTimeZone ? withTimeSeparator : `${withTimeSeparator}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value) {
  const date = parseDateTime(value);
  if (!date) return UNKNOWN_DATE_TIME;

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatValue(value, maximumFractionDigits = 2) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return NUMBER_UNAVAILABLE;

  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits }).format(numericValue);
}

export function formatMoisture(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return NUMBER_UNAVAILABLE;
  return formatValue(Math.round(numericValue), 0);
}

export function differenceText(values, suffix = "") {
  if (!Array.isArray(values) || values.length < 2) return "比較データはまだありません";

  const [latest, previous] = values.map(Number);
  if (!Number.isFinite(latest) || !Number.isFinite(previous)) return "比較データはまだありません";

  const difference = latest - previous;
  if (difference === 0) return "前回と同じ";
  return `前回から ${difference > 0 ? "+" : ""}${formatValue(difference)}${suffix}`;
}

export function metricHistoryState(metrics) {
  if (!Array.isArray(metrics) || metrics.length === 0) return "empty";
  return metrics.length === 1 ? "single" : "multiple";
}

export function formatChartTooltipTitle(metrics, dataIndex) {
  return formatDateTime(metrics?.[dataIndex]?.created_at);
}

export function formatChartTooltipLabel(label, value, unit = "%") {
  return `${label || "値"}: ${formatValue(value)}${unit}`;
}

export function metricLabel(metricType) {
  const labels = {
    weight: "重量",
    soil_moisture: "土壌水分（生値）",
  };
  return labels[metricType] ?? String(metricType ?? "値");
}

export function metricUnit(metricType) {
  return metricType === "weight" ? "g" : "";
}

export function formatRawValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? String(numericValue) : NUMBER_UNAVAILABLE;
}

export function rawDifferenceText(latest, previous, unit = "") {
  const latestValue = Number(latest);
  const previousValue = Number(previous);
  if (!Number.isFinite(latestValue) || !Number.isFinite(previousValue)) return "—";
  const difference = latestValue - previousValue;
  if (difference === 0) return `0${unit}`;
  // DBの値そのものは変えず、IEEE 754の計算誤差だけを表示から除く。
  const displayed = new Intl.NumberFormat("ja-JP", { useGrouping: false, maximumFractionDigits: 12 }).format(difference);
  return `${difference > 0 ? "+" : ""}${displayed}${unit}`;
}

export function rawMetricBounds(metrics) {
  const values = Array.isArray(metrics) ? metrics.map((metric) => Number(metric?.value)).filter(Number.isFinite) : [];
  if (!values.length) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = minimum === maximum ? Math.max(Math.abs(minimum) * 0.05, 1) : (maximum - minimum) * 0.1;
  return { min: minimum - padding, max: maximum + padding };
}

export function totalMetricCount(metricTypes) {
  if (!Array.isArray(metricTypes)) return 0;
  return metricTypes.reduce((total, metricType) => total + (Number.isSafeInteger(metricType?.totalCount) && metricType.totalCount > 0 ? metricType.totalCount : 0), 0);
}
