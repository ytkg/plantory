import { json } from "./http";
import { buildMoistureStatuses, type MoistureMetric } from "./moisture";

export async function listStatus(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `WITH ranges AS (
       SELECT plant_id, metric_type, MIN(value) AS min_value, MAX(value) AS max_value
       FROM metrics
       WHERE metric_type IN ('soil_moisture', 'weight')
       GROUP BY plant_id, metric_type
     ), latest AS (
       SELECT plant_id, metric_type, value,
         ROW_NUMBER() OVER (PARTITION BY plant_id, metric_type ORDER BY created_at DESC, id DESC) AS row_number
       FROM metrics
       WHERE metric_type IN ('soil_moisture', 'weight')
     )
     SELECT p.id AS plant_id, p.name, latest.metric_type, latest.value,
       ranges.min_value, ranges.max_value
     FROM plants p
     JOIN latest ON latest.plant_id = p.id AND latest.row_number = 1
     JOIN ranges ON ranges.plant_id = latest.plant_id AND ranges.metric_type = latest.metric_type
     ORDER BY p.id ASC`,
  ).all<MoistureMetric>();

  return json(buildMoistureStatuses(result.results));
}
