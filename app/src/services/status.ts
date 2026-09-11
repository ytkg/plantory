import { buildMoistureStatuses, calculateMoistureRange, type MoistureMetric, type MoistureRange } from "../moisture";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { metrics as metricsTable, plants } from "../db/schema";
import type { AppContext } from "../routes/context";

type StatusMetric = Omit<MoistureMetric, "lower" | "upper">;

function metricGroupKey(metric: Pick<StatusMetric, "plant_id" | "metric_type">): string {
  return `${metric.plant_id}:${metric.metric_type}`;
}

export async function listStatus(c: AppContext): Promise<Response> {
  const result = await db(c.env.DB).select({ plant_id: plants.id, name: plants.name, metric_type: metricsTable.metricType, value: metricsTable.value, created_at: metricsTable.createdAt }).from(plants).innerJoin(metricsTable, eq(metricsTable.plantId, plants.id)).where(inArray(metricsTable.metricType, ["soil_moisture", "weight"])).orderBy(plants.id, desc(metricsTable.createdAt), desc(metricsTable.id)).all() as StatusMetric[];

  const metricGroups = new Map<string, StatusMetric[]>();
  for (const metric of result) {
    const key = metricGroupKey(metric);
    const group = metricGroups.get(key);
    if (group) group.push(metric);
    else metricGroups.set(key, [metric]);
  }
  const ranges = new Map<string, MoistureRange>();
  for (const [key, metrics] of metricGroups) {
    ranges.set(key, calculateMoistureRange(metrics.map((metric) => metric.value)) ?? { lower: metrics[0].value, upper: metrics[0].value });
  }
  const metrics: MoistureMetric[] = result.map((metric) => ({ ...metric, ...ranges.get(metricGroupKey(metric))! }));
  return c.json(buildMoistureStatuses(metrics));
}
