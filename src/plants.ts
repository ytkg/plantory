import { error, json } from "./http";
import type { Metric, Plant } from "./types";

type CreatePlantInput = { name?: unknown };
type CreateMetricInput = { metric_type?: unknown; value?: unknown };

export async function listPlants(env: Env): Promise<Response> {
  const result = await env.DB.prepare("SELECT id, name, created_at, updated_at FROM plants ORDER BY id DESC").all<Plant>();
  return json({ plants: result.results });
}

export async function createPlant(request: Request, env: Env): Promise<Response> {
  let input: CreatePlantInput;
  try {
    input = await request.json();
  } catch {
    return error("Request body must be valid JSON.", 400);
  }
  if (typeof input.name !== "string") return error("name is required.", 400);

  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) return error("name must contain 1 to 100 characters.", 400);

  const result = await env.DB.prepare(
    `INSERT INTO plants (name, created_at, updated_at)
     VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id, name, created_at, updated_at`,
  ).bind(name).all<Plant>();
  return result.results[0] ? json({ plant: result.results[0] }, 201) : error("Could not create plant.", 500);
}

async function plantExists(id: number, env: Env): Promise<boolean> {
  return (await env.DB.prepare("SELECT id FROM plants WHERE id = ? LIMIT 1").bind(id).first<Pick<Plant, "id">>()) !== null;
}

export async function listMetrics(plantId: number, env: Env): Promise<Response> {
  if (!(await plantExists(plantId, env))) return error("Plant not found.", 404);

  const result = await env.DB.prepare(
    `SELECT id, plant_id, metric_type, value, created_at
     FROM metrics WHERE plant_id = ? ORDER BY id DESC LIMIT 100`,
  ).bind(plantId).all<Metric>();
  return json({ metrics: result.results });
}

export async function createMetric(plantId: number, request: Request, env: Env): Promise<Response> {
  let input: CreateMetricInput;
  try {
    input = await request.json();
  } catch {
    return error("Request body must be valid JSON.", 400);
  }
  if (typeof input.metric_type !== "string" || !/^[a-z][a-z0-9_]{0,49}$/.test(input.metric_type)) {
    return error("metric_type must be 1 to 50 lowercase letters, numbers, or underscores.", 400);
  }
  if (typeof input.value !== "number" || !Number.isFinite(input.value)) return error("value must be a finite number.", 400);
  if (!(await plantExists(plantId, env))) return error("Plant not found.", 404);

  const result = await env.DB.prepare(
    `INSERT INTO metrics (plant_id, metric_type, value, created_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     RETURNING id, plant_id, metric_type, value, created_at`,
  ).bind(plantId, input.metric_type, input.value).all<Metric>();
  return result.results[0] ? json({ metric: result.results[0] }, 201) : error("Could not create metric.", 500);
}
