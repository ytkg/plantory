import { describe, expect, it } from "vitest";
import { buildMoistureStatuses, calculateMoistureRange, toMoistureStatus } from "../src/moisture";

const metric = (plant_id: number, name: string, metric_type: "soil_moisture" | "weight", value: number, lower: number, upper: number) => ({
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

  it("prioritizes soil moisture and rounds the relative value", () => {
    expect(buildMoistureStatuses([
      metric(1, "カランコエ", "weight", 90, 10, 90),
      metric(1, "カランコエ", "soil_moisture", 17, 10, 31),
    ])).toEqual([{ name: "カランコエ", moisture: 33 }]);
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
