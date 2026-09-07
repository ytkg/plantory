export function resourceId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export type HistoryQuery = {
  from?: string;
  to?: string;
  limit: number;
};

type HistoryQueryResult = { value: HistoryQuery } | { error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 1000;

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
