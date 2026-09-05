import { describe, expect, it } from "vitest";
import { buildMoistureStatuses, calculateMoisturePercentage, calculateMoistureRange, toMoistureStatus } from "../src/moisture";

const metric = (plant_id: number, name: string, metric_type: string, value: number, lower: number, upper: number) => ({
  plant_id,
  name,
  metric_type,
  value,
  lower,
  upper,
});

describe("moisture status calculation", () => {
  it("calculates linearly interpolated P5 and P95 ranges", () => {
    expect(calculateMoistureRange([0, 10, 20, 30, 40])).toEqual({ lower: 2, upper: 38 });
    expect(toMoistureStatus(metric(1, "鉢", "weight", -10, 2, 38))).toEqual({ name: "鉢", moisture: 0 });
    expect(toMoistureStatus(metric(1, "鉢", "weight", 50, 2, 38))).toEqual({ name: "鉢", moisture: 100 });
  });

  it("inverts soil moisture and rounds the relative value", () => {
    expect(buildMoistureStatuses([
      metric(1, "カランコエ", "weight", 90, 10, 90),
      metric(1, "カランコエ", "soil_moisture", 17, 10, 31),
    ])).toEqual([{ name: "カランコエ", moisture: 67 }]);
  });

  it("maps soil moisture P5 to 100% and P95 to 0%, including clamping", () => {
    const range = { lower: 10, upper: 90 };
    expect(calculateMoisturePercentage(10, range, "soil_moisture")).toBe(100);
    expect(calculateMoisturePercentage(90, range, "soil_moisture")).toBe(0);
    expect(calculateMoisturePercentage(50, range, "soil_moisture")).toBe(50);
    expect(calculateMoisturePercentage(0, range, "soil_moisture")).toBe(100);
    expect(calculateMoisturePercentage(100, range, "soil_moisture")).toBe(0);
    expect(calculateMoisturePercentage(43.2, range, "soil_moisture")).toBe(59);
  });

  it("keeps weight increasing and omits undefined moisture directions", () => {
    const range = { lower: 10, upper: 90 };
    expect(calculateMoisturePercentage(10, range, "weight")).toBe(0);
    expect(calculateMoisturePercentage(90, range, "weight")).toBe(100);
    expect(calculateMoisturePercentage(50, range, "weight")).toBe(50);
    expect(calculateMoisturePercentage(50, range, "unknown_water_metric")).toBeNull();
    expect(calculateMoisturePercentage(50, { lower: 10, upper: 10 }, "soil_moisture")).toBeNull();
  });

  it("falls back to weight, preserves duplicate names, and omits unavailable values", () => {
    expect(buildMoistureStatuses([
      metric(1, "同じ名前", "weight", 1, 0, 3),
      metric(2, "同じ名前", "weight", 2, 0, 3),
      metric(3, "記録なし", "soil_moisture", 5, 5, 5),
    ])).toEqual([
      { name: "同じ名前", moisture: 33 },
      { name: "同じ名前", moisture: 67 },
    ]);
  });
});
