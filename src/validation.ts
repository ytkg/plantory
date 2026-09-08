export function resourceId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export type HistoryQuery = {
  from?: string;
  to?: string;
  limit: number;
};

export type RawMetricQuery = {
  metricType: string;
  from?: string;
  to?: string;
  limit: number;
  cursor?: { createdAt: string; id: number };
};

type HistoryQueryResult = { value: HistoryQuery } | { error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 1000;
const DEFAULT_RAW_METRIC_LIMIT = 100;
const MAX_RAW_METRIC_LIMIT = 500;
const METRIC_TYPE = /^[a-z][a-z0-9_]{0,49}$/;

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function historyQuery(searchParams: URLSearchParams | Record<string, string>): HistoryQueryResult {
  const get = (name: string): string | null => searchParams instanceof URLSearchParams ? searchParams.get(name) : searchParams[name] ?? null;
  const from = get("from") ?? undefined;
  const to = get("to") ?? undefined;
  const limitValue = get("limit");

  if (from && !isIsoDate(from)) return { error: "from must be an ISO date (YYYY-MM-DD)." };
  if (to && !isIsoDate(to)) return { error: "to must be an ISO date (YYYY-MM-DD)." };
  if (from && to && from > to) return { error: "from must be on or before to." };

  const limit = limitValue === null ? DEFAULT_HISTORY_LIMIT : Number(limitValue);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_HISTORY_LIMIT) {
    return { error: `limit must be an integer between 1 and ${MAX_HISTORY_LIMIT}.` };
  }

  return { value: { from, to, limit } };
}

function isIsoDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function rawMetricCursor(value: string | null): RawMetricQuery["cursor"] | null {
  if (!value) return undefined;
  const match = /^(.*)\|(\d+)$/.exec(value);
  if (!match || !isIsoDateTime(match[1])) return null;
  const id = Number(match[2]);
  return Number.isSafeInteger(id) && id > 0 ? { createdAt: match[1], id } : null;
}

export function rawMetricQuery(searchParams: URLSearchParams | Record<string, string>): { value: RawMetricQuery } | { error: string } {
  const get = (name: string): string | null => searchParams instanceof URLSearchParams ? searchParams.get(name) : searchParams[name] ?? null;
  const metricType = get("metric_type");
  const from = get("from") ?? undefined;
  const to = get("to") ?? undefined;
  const limitValue = get("limit");
  const cursor = rawMetricCursor(get("cursor"));

  if (!metricType || !METRIC_TYPE.test(metricType)) return { error: "metric_type must be 1 to 50 lowercase letters, numbers, or underscores." };
  if (from && !isIsoDateTime(from)) return { error: "from must be a UTC ISO 8601 timestamp." };
  if (to && !isIsoDateTime(to)) return { error: "to must be a UTC ISO 8601 timestamp." };
  if (from && to && from > to) return { error: "from must be on or before to." };
  if (cursor === null) return { error: "cursor must contain a UTC ISO 8601 timestamp and metric id." };

  const limit = limitValue === null ? DEFAULT_RAW_METRIC_LIMIT : Number(limitValue);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RAW_METRIC_LIMIT) {
    return { error: `limit must be an integer between 1 and ${MAX_RAW_METRIC_LIMIT}.` };
  }
  return { value: { metricType, from, to, limit, cursor } };
}
