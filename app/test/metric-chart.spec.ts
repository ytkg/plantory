import { describe, expect, it } from "vitest";
import { chartTimeBounds } from "../public/metric-chart.js";

describe("chartTimeBounds", () => {
  it("sets the first measurement as the left edge and the reference time as the right edge", () => {
    const referenceTime = Date.parse("2026-09-20T00:00:00Z");

    expect(chartTimeBounds([
      { created_at: "2026-09-01T00:00:00Z" },
      { created_at: "2026-09-02T00:00:00Z" },
    ], referenceTime)).toEqual({
      min: Date.parse("2026-09-01T00:00:00Z"),
      max: referenceTime,
    });
  });
});
