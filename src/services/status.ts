import { buildMoistureStatuses, calculateMoistureRange, type MoistureMetric, type MoistureRange } from "../moisture";
import type { AppContext } from "../routes/context";

type StatusMetric = Omit<MoistureMetric, "lower" | "upper">;

function metricGroupKey(metric: Pick<StatusMetric, "plant_id" | "metric_type">): string {
  return `${metric.plant_id}:${metric.metric_type}`;
}

export async function listStatus(c: AppContext): Promise<Response> {
  const result = await c.env.DB.prepare(
    `SELECT p.id AS plant_id, p.name, m.metric_type, m.value, m.created_at, m.id
     FROM plants p JOIN metrics m ON m.plant_id = p.id
     WHERE m.metric_type IN ('soil_moisture', 'weight')
     ORDER BY p.id ASC, m.created_at DESC, m.id DESC`,
  ).all<StatusMetric>();

  const metricGroups = new Map<string, StatusMetric[]>();
  for (const metric of result.results) {
    const key = metricGroupKey(metric);
    const group = metricGroups.get(key);
    if (group) group.push(metric);
    else metricGroups.set(key, [metric]);
  }
  const ranges = new Map<string, MoistureRange>();
  for (const [key, metrics] of metricGroups) {
    ranges.set(key, calculateMoistureRange(metrics.map((metric) => metric.value)) ?? { lower: metrics[0].value, upper: metrics[0].value });
  }
  const metrics: MoistureMetric[] = result.results.map((metric) => ({ ...metric, ...ranges.get(metricGroupKey(metric))! }));
  return c.json(buildMoistureStatuses(metrics));
}
