import { calculateMoistureRange, getMoistureDirection } from "../moisture";
import type { AppContext } from "../routes/context";
import type { Metric, Plant } from "../types";

type CreatePlantInput = { name?: unknown };
type CreateMetricInput = { metric_type?: unknown; value?: unknown };

export async function listPlants(c: AppContext): Promise<Response> {
  const result = await c.env.DB.prepare("SELECT id, name, created_at, updated_at FROM plants ORDER BY id ASC").all<Plant>();
  return c.json({ plants: result.results });
}

export async function createPlant(c: AppContext): Promise<Response> {
  let input: CreatePlantInput;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON." }, 400);
  }
  if (typeof input.name !== "string") return c.json({ error: "name is required." }, 400);

  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) return c.json({ error: "name must contain 1 to 100 characters." }, 400);

  const result = await c.env.DB.prepare(
    `INSERT INTO plants (name, created_at, updated_at)
     VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id, name, created_at, updated_at`,
  ).bind(name).all<Plant>();
  return result.results[0] ? c.json({ plant: result.results[0] }, 201) : c.json({ error: "Could not create plant." }, 500);
}

async function plantExists(id: number, c: AppContext): Promise<boolean> {
  return (await c.env.DB.prepare("SELECT id FROM plants WHERE id = ? LIMIT 1").bind(id).first<Pick<Plant, "id">>()) !== null;
}

export async function listMetrics(plantId: number, c: AppContext): Promise<Response> {
  if (!(await plantExists(plantId, c))) return c.json({ error: "Plant not found." }, 404);

  const [result, rangeResult, countResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, plant_id, metric_type, value, created_at
       FROM metrics WHERE plant_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
    ).bind(plantId).all<Metric>(),
    c.env.DB.prepare("SELECT metric_type, value FROM metrics WHERE plant_id = ? AND metric_type IN ('soil_moisture', 'weight')").bind(plantId).all<{ metric_type: string; value: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total_count FROM metrics WHERE plant_id = ?").bind(plantId).first<{ total_count: number }>(),
  ]);
  const moistureRanges = Object.fromEntries(
    ["soil_moisture", "weight"].flatMap((type) => {
      const range = calculateMoistureRange(rangeResult.results.filter((metric) => metric.metric_type === type).map((metric) => metric.value));
      const direction = getMoistureDirection(type);
      return range && direction ? [[type, { ...range, direction }]] : [];
    }),
  );
  return c.json({ metrics: result.results, moistureRanges, totalCount: countResult?.total_count ?? 0 });
}

export async function deleteMetrics(plantId: number, c: AppContext): Promise<Response> {
  if (!(await plantExists(plantId, c))) return c.json({ error: "Plant not found." }, 404);
  await c.env.DB.prepare("DELETE FROM metrics WHERE plant_id = ?").bind(plantId).run();
  return new Response(null, { status: 204 });
}

export async function createMetric(plantId: number, c: AppContext): Promise<Response> {
  let input: CreateMetricInput;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON." }, 400);
  }
  if (typeof input.metric_type !== "string" || !/^[a-z][a-z0-9_]{0,49}$/.test(input.metric_type)) {
    return c.json({ error: "metric_type must be 1 to 50 lowercase letters, numbers, or underscores." }, 400);
  }
  if (typeof input.value !== "number" || !Number.isFinite(input.value)) return c.json({ error: "value must be a finite number." }, 400);
  if (!(await plantExists(plantId, c))) return c.json({ error: "Plant not found." }, 404);

  const result = await c.env.DB.prepare(
    `INSERT INTO metrics (plant_id, metric_type, value, created_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     RETURNING id, plant_id, metric_type, value, created_at`,
  ).bind(plantId, input.metric_type, input.value).all<Metric>();
  return result.results[0] ? c.json({ metric: result.results[0] }, 201) : c.json({ error: "Could not create metric." }, 500);
}
