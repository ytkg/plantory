import { describe, expect, it } from "vitest";
import {
  differenceText,
  formatChartTooltipLabel,
  formatChartTooltipTitle,
  formatDateTime,
  formatMoisture,
  formatRawValue,
  formatValue,
  metricLabel,
  metricUnit,
  metricHistoryState,
  rawDifferenceText,
  rawMetricBounds,
} from "../public/presentation.js";

describe("frontend presentation helpers", () => {
  it("formats UTC and legacy SQLite timestamps in JST", () => {
    expect(formatDateTime("2026-09-06T21:00:11Z")).toBe("9/7 06:00");
    expect(formatDateTime("2026-09-06 21:00:11")).toBe("9/7 06:00");
  });

  it("handles invalid timestamps safely", () => {
    expect(formatDateTime("not-a-date")).toBe("日時不明");
    expect(formatDateTime(null)).toBe("日時不明");
  });

  it("formats moisture as a rounded percentage value and general values with decimals", () => {
    expect(formatMoisture(42.6)).toBe("43");
    expect(formatValue(12.3456)).toBe("12.35");
    expect(formatValue(12.3456, 1)).toBe("12.3");
    expect(formatValue("invalid")).toBe("—");
  });

  it("describes metric differences with the appropriate sign and unit", () => {
    expect(differenceText([])).toBe("比較データはまだありません");
    expect(differenceText([42])).toBe("比較データはまだありません");
    expect(differenceText([42, 42], "%")).toBe("前回と同じ");
    expect(differenceText([42.5, 40], "%")).toBe("前回から +2.5%");
    expect(differenceText([38, 40], "%")).toBe("前回から -2%");
  });

  it("creates tooltip text from metric history without depending on the DOM", () => {
    const metrics = [{ created_at: "2026-09-06T21:00:11Z", value: 42.25 }];

    expect(formatChartTooltipTitle(metrics, 0)).toBe("9/7 06:00");
    expect(formatChartTooltipTitle(metrics, 1)).toBe("日時不明");
    expect(formatChartTooltipLabel("水分量", 42.25)).toBe("水分量: 42.25%");
    expect(formatChartTooltipLabel("室温", 26.4, "℃")).toBe("室温: 26.4℃");
  });

  it("distinguishes empty, single, and multiple metric histories", () => {
    expect(metricHistoryState([])).toBe("empty");
    expect(metricHistoryState([{ value: 42 }])).toBe("single");
    expect(metricHistoryState([{ value: 42 }, { value: 40 }])).toBe("multiple");
  });

  it("keeps raw metric values and known units without display rounding", () => {
    expect(metricLabel("weight")).toBe("重量");
    expect(metricLabel("battery_voltage")).toBe("battery_voltage");
    expect(metricUnit("weight")).toBe("g");
    expect(metricUnit("soil_moisture")).toBe("");
    expect(formatRawValue(482.347)).toBe("482.347");
    expect(rawDifferenceText(482.347, 483.547, " g")).toBe("-1.2 g");
  });

  it("adds an adaptive non-zero range around raw metric values", () => {
    expect(rawMetricBounds([])).toBeNull();
    expect(rawMetricBounds([{ value: 10 }, { value: 20 }])).toEqual({ min: 9, max: 21 });
    expect(rawMetricBounds([{ value: 0 }, { value: 0 }])).toEqual({ min: -1, max: 1 });
  });
});
