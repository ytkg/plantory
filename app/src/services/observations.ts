import { calculateMoisturePercentage, calculateMoistureRange, getMoistureDirection, type MoistureRange } from "../moisture";
import type { AppContext } from "../routes/context";
import { toUtcIsoTimestamp } from "../time";
import type { Metric, Plant } from "../types";
import type { HistoryQuery } from "../validation";
import { metricHistoryReadings, rawMetricHistories, waterMetrics, type RawMetricHistory } from "./metrics";
import { getPlantData, plantExists } from "./plants";

type WaterMetricType = "soil_moisture" | "weight";
type MoistureMetric = Pick<Metric, "id" | "plant_id" | "created_at"> & { value: number };
type MoistureMetricSource = {
  metricType: WaterMetricType | null;
  metrics: Metric[];
  range: MoistureRange | null;
};
export type MetricHistory = { metrics: MoistureMetric[]; totalCount: number };
export type PlantObservationData = {
  plant: Plant;
  moistureHistory: MetricHistory;
  moistureSource: { metric_type: WaterMetricType; direction: "increasing" | "decreasing"; p5: number; p95: number } | null;
  rawMetricHistories: RawMetricHistory[];
};

export async function listMetrics(plantId: number, query: HistoryQuery, c: AppContext): Promise<Response> {
  const history = await currentMetricHistory(plantId, query, c.env);
  return history ? c.json(history) : c.json({ error: "Plant not found." }, 404);
}

async function resolveMoistureMetricSource(plantId: number, env: Env, includeFuture = true): Promise<MoistureMetricSource> {
  const allWaterMetrics = await waterMetrics(plantId, env, includeFuture);
  const metricType: WaterMetricType | null = allWaterMetrics.some((metric) => metric.metric_type === "soil_moisture")
    ? "soil_moisture"
    : allWaterMetrics.some((metric) => metric.metric_type === "weight") ? "weight" : null;
  const metrics = metricType ? allWaterMetrics.filter((metric) => metric.metric_type === metricType) : [];
  return { metricType, metrics, range: calculateMoistureRange(metrics.map((metric) => metric.value)) };
}

export async function metricHistory(plantId: number, query: HistoryQuery, env: Env): Promise<MetricHistory | null> {
  if (!(await plantExists(plantId, env))) return null;
  return moistureHistoryFromSource(plantId, query, await resolveMoistureMetricSource(plantId, env), env);
}

async function currentMetricHistory(plantId: number, query: HistoryQuery, env: Env): Promise<MetricHistory | null> {
  if (!(await plantExists(plantId, env))) return null;
  return moistureHistoryFromSource(plantId, query, await resolveMoistureMetricSource(plantId, env, false), env, false);
}

async function moistureHistoryFromSource(plantId: number, query: HistoryQuery, source: MoistureMetricSource, env: Env, includeFuture = true): Promise<MetricHistory> {
  const { metricType, metrics: sourceMetrics, range } = source;

  if (!metricType || !range) return { metrics: [], totalCount: sourceMetrics.length };

  const result = await metricHistoryReadings(plantId, metricType, query, env, includeFuture);
  const metrics = result.flatMap((metric): MoistureMetric[] => {
    const value = calculateMoisturePercentage(metric.value, range, metricType);
    return value === null ? [] : [{ id: metric.id, plant_id: metric.plant_id, value, created_at: toUtcIsoTimestamp(metric.created_at) }];
  });
  return { metrics, totalCount: sourceMetrics.length };
}

export async function plantObservationData(plantId: number, query: HistoryQuery, env: Env): Promise<PlantObservationData | null> {
  const plant = await getPlantData(plantId, env);
  if (!plant) return null;

  const source = await resolveMoistureMetricSource(plantId, env);
  const { metricType, range } = source;
  const [moistureHistory, rawHistories] = await Promise.all([
    moistureHistoryFromSource(plantId, query, source, env),
    rawMetricHistories(plantId, query, env),
  ]);

  return {
    plant,
    moistureHistory,
    moistureSource: metricType && range ? {
      metric_type: metricType,
      direction: getMoistureDirection(metricType)!,
      p5: range.lower,
      p95: range.upper,
    } : null,
    rawMetricHistories: rawHistories,
  };
}
