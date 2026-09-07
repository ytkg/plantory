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
