import { describe, expect, it } from "vitest";
import { metricFetchLimit, shouldFetchAllMetrics } from "../public/metrics-query.js";

describe("metric query options", () => {
  it("limits the recent range to 30 readings without loading another page", () => {
    expect(metricFetchLimit("recent")).toBe(30);
    expect(shouldFetchAllMetrics("recent")).toBe(false);
  });

  it.each(["7", "30", "90"])("keeps fetching every reading in the %s-day range", (range) => {
    expect(metricFetchLimit(range)).toBe(500);
    expect(shouldFetchAllMetrics(range)).toBe(true);
  });
});
