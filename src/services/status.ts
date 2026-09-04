import { json } from "../http";
import { buildMoistureStatuses, calculateMoistureRange, type MoistureMetric } from "../moisture";

export async function listStatus(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT p.id AS plant_id, p.name, m.metric_type, m.value, m.created_at, m.id
     FROM plants p JOIN metrics m ON m.plant_id = p.id
     WHERE m.metric_type IN ('soil_moisture', 'weight')
     ORDER BY p.id ASC, m.created_at DESC, m.id DESC`,
  ).all<MoistureMetric>();

  const metrics = result.results.map((metric) => ({
    ...metric,
    ...(calculateMoistureRange(result.results.filter((candidate) => candidate.plant_id === metric.plant_id && candidate.metric_type === metric.metric_type).map((candidate) => candidate.value)) ?? { lower: metric.value, upper: metric.value }),
  }));
  return json(buildMoistureStatuses(metrics));
}
