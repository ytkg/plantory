export function metricFetchLimit(range) {
  return range === "recent" ? 30 : 500;
}

export function shouldFetchAllMetrics(range) {
  return range !== "recent";
}
