import { calculateMoisturePercentage, calculateMoistureRange, getMoistureDirection, type MoistureRange } from "../moisture";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { metrics as metricsTable, plants } from "../db/schema";
import type { AppContext } from "../routes/context";
import { toUtcIsoTimestamp } from "../time";
import type { Metric, Plant } from "../types";
import type { HistoryQuery, RawMetricQuery } from "../validation";

type CreatePlantInput = { name?: unknown };
type CreateMetricInput = { metric_type?: unknown; value?: unknown };
type WaterMetricType = "soil_moisture" | "weight";
type MoistureMetric = Pick<Metric, "id" | "plant_id" | "created_at"> & { value: number };
type MoistureMetricSource = {
  metricType: WaterMetricType | null;
  metrics: Metric[];
  range: MoistureRange | null;
};
export type MetricHistory = { metrics: MoistureMetric[]; totalCount: number };
type RawMetricReading = Pick<Metric, "id" | "plant_id" | "metric_type" | "value"> & { created_at: string };
export type RawMetricHistory = { metric_type: string; metrics: RawMetricReading[]; totalCount: number };
export type PlantObservationData = {
  plant: Plant;
  moistureHistory: MetricHistory;
  moistureSource: { metric_type: WaterMetricType; direction: "increasing" | "decreasing"; p5: number; p95: number } | null;
  rawMetricHistories: RawMetricHistory[];
};
export type RawMetricType = {
  metric_type: string;
  totalCount: number;
  latest: RawMetricReading | null;
  previous: RawMetricReading | null;
};
export type RawMetricPage = {
  plant: Plant;
  metricTypes: RawMetricType[];
  metric_type: string;
  metrics: RawMetricReading[];
  totalCount: number;
  nextCursor: string | null;
};

export async function listPlants(c: AppContext): Promise<Response> {
  return c.json({ plants: await listPlantsData(c.env) });
}

export async function listPlantsData(env: Env): Promise<Plant[]> {
  return (await db(env.DB).select({ id: plants.id, name: plants.name, created_at: plants.createdAt, updated_at: plants.updatedAt }).from(plants).orderBy(plants.id).all()) as Plant[];
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

  const result = await db(c.env.DB).insert(plants).values({ name, createdAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` }).returning({ id: plants.id, name: plants.name, created_at: plants.createdAt, updated_at: plants.updatedAt }).all();
  return result[0] ? c.json({ plant: result[0] as Plant }, 201) : c.json({ error: "Could not create plant." }, 500);
}

async function plantExists(id: number, c: AppContext): Promise<boolean> {
  return (await db(c.env.DB).select({ id: plants.id }).from(plants).where(eq(plants.id, id)).limit(1).get()) !== undefined;
}

export async function listMetrics(plantId: number, query: HistoryQuery, c: AppContext): Promise<Response> {
  const history = await metricHistory(plantId, query, c.env);
  return history ? c.json(history) : c.json({ error: "Plant not found." }, 404);
}

function rawReading(metric: Metric): RawMetricReading {
  return { ...metric, created_at: toUtcIsoTimestamp(metric.created_at) };
}

async function rawMetricTypes(plantId: number, env: Env): Promise<RawMetricType[]> {
  const types = await env.DB.prepare(
    "SELECT metric_type, COUNT(*) AS total_count FROM metrics WHERE plant_id = ? GROUP BY metric_type ORDER BY metric_type ASC",
  ).bind(plantId).all<{ metric_type: string; total_count: number }>();

  return Promise.all(types.results.map(async ({ metric_type, total_count }) => {
    const result = await env.DB.prepare(
      `SELECT id, plant_id, metric_type, value, created_at
       FROM metrics WHERE plant_id = ? AND metric_type = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 2`,
    ).bind(plantId, metric_type).all<Metric>();
    return {
      metric_type,
      totalCount: total_count,
      latest: result.results[0] ? rawReading(result.results[0]) : null,
      previous: result.results[1] ? rawReading(result.results[1]) : null,
    };
  }));
}

export async function rawMetricPage(plantId: number, query: RawMetricQuery, env: Env): Promise<RawMetricPage | null> {
  const plant = await env.DB.prepare("SELECT id, name, created_at, updated_at FROM plants WHERE id = ? LIMIT 1").bind(plantId).first<Plant>();
  if (!plant) return null;

  const metricTypes = await rawMetricTypes(plantId, env);
  const selected = metricTypes.find((type) => type.metric_type === query.metricType);
  if (!selected) {
    return { plant, metricTypes, metric_type: query.metricType, metrics: [], totalCount: 0, nextCursor: null };
  }

  const clauses = ["plant_id = ?", "metric_type = ?"];
  const bindings: Array<number | string> = [plantId, query.metricType];
  if (query.from) {
    clauses.push("julianday(created_at) >= julianday(?)");
    bindings.push(query.from);
  }
  if (query.to) {
    clauses.push("julianday(created_at) <= julianday(?)");
    bindings.push(query.to);
  }
  if (query.cursor) {
    clauses.push("(julianday(created_at) < julianday(?) OR (julianday(created_at) = julianday(?) AND id < ?))");
    bindings.push(query.cursor.createdAt, query.cursor.createdAt, query.cursor.id);
  }
  bindings.push(query.limit + 1);
  const result = await env.DB.prepare(
    `SELECT id, plant_id, metric_type, value, created_at
     FROM metrics WHERE ${clauses.join(" AND ")} ORDER BY datetime(created_at) DESC, id DESC LIMIT ?`,
  ).bind(...bindings).all<Metric>();
  const hasMore = result.results.length > query.limit;
  const metrics = result.results.slice(0, query.limit).map(rawReading);
  const last = metrics.at(-1);
  return {
    plant,
    metricTypes,
    metric_type: query.metricType,
    metrics,
    totalCount: selected.totalCount,
    nextCursor: hasMore && last ? `${last.created_at}|${last.id}` : null,
  };
}

async function resolveMoistureMetricSource(plantId: number, env: Env): Promise<MoistureMetricSource> {
  const allWaterMetrics = await env.DB.prepare(
    "SELECT id, plant_id, metric_type, value, created_at FROM metrics WHERE plant_id = ? AND metric_type IN ('soil_moisture', 'weight') ORDER BY created_at DESC, id DESC",
  ).bind(plantId).all<Metric>();
  const metricType: WaterMetricType | null = allWaterMetrics.results.some((metric) => metric.metric_type === "soil_moisture")
    ? "soil_moisture"
    : allWaterMetrics.results.some((metric) => metric.metric_type === "weight") ? "weight" : null;
  const metrics = metricType ? allWaterMetrics.results.filter((metric) => metric.metric_type === metricType) : [];
  return { metricType, metrics, range: calculateMoistureRange(metrics.map((metric) => metric.value)) };
}

export async function metricHistory(plantId: number, query: HistoryQuery, env: Env): Promise<MetricHistory | null> {
  const exists = await env.DB.prepare("SELECT id FROM plants WHERE id = ? LIMIT 1").bind(plantId).first<Pick<Plant, "id">>();
  if (!exists) return null;

  const { metricType, metrics: sourceMetrics, range } = await resolveMoistureMetricSource(plantId, env);

  if (!metricType || !range) return { metrics: [], totalCount: sourceMetrics.length };

  const clauses = ["plant_id = ?", "metric_type = ?"];
  const bindings: Array<number | string> = [plantId, metricType];
  if (query.from) {
    clauses.push("datetime(created_at) >= datetime(?, '-9 hours')");
    bindings.push(query.from);
  }
  if (query.to) {
    clauses.push("datetime(created_at) < datetime(?, '+1 day', '-9 hours')");
    bindings.push(query.to);
  }
  bindings.push(query.limit);

  const result = await env.DB.prepare(
    `SELECT id, plant_id, metric_type, value, created_at
     FROM metrics WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).bind(...bindings).all<Metric>();
  const metrics = result.results.flatMap((metric): MoistureMetric[] => {
    const value = calculateMoisturePercentage(metric.value, range, metricType);
    return value === null ? [] : [{ id: metric.id, plant_id: metric.plant_id, value, created_at: toUtcIsoTimestamp(metric.created_at) }];
  });
  return { metrics, totalCount: sourceMetrics.length };
}

async function rawMetricHistories(plantId: number, query: HistoryQuery, env: Env): Promise<RawMetricHistory[]> {
  const metricTypes = await env.DB.prepare(
    "SELECT metric_type, COUNT(*) AS total_count FROM metrics WHERE plant_id = ? GROUP BY metric_type ORDER BY metric_type ASC",
  ).bind(plantId).all<{ metric_type: string; total_count: number }>();

  return Promise.all(metricTypes.results.map(async ({ metric_type, total_count }) => {
    const clauses = ["plant_id = ?", "metric_type = ?"];
    const bindings: Array<number | string> = [plantId, metric_type];
    if (query.from) {
      clauses.push("datetime(created_at) >= datetime(?, '-9 hours')");
      bindings.push(query.from);
    }
    if (query.to) {
      clauses.push("datetime(created_at) < datetime(?, '+1 day', '-9 hours')");
      bindings.push(query.to);
    }
    bindings.push(query.limit);

    const result = await env.DB.prepare(
      `SELECT id, plant_id, metric_type, value, created_at
       FROM metrics WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).bind(...bindings).all<Metric>();
    return {
      metric_type,
      metrics: result.results.map(rawReading),
      totalCount: total_count,
    };
  }));
}

export async function plantObservationData(plantId: number, query: HistoryQuery, env: Env): Promise<PlantObservationData | null> {
  const plant = await env.DB.prepare("SELECT id, name, created_at, updated_at FROM plants WHERE id = ? LIMIT 1").bind(plantId).first<Plant>();
  if (!plant) return null;

  const { metricType, range } = await resolveMoistureMetricSource(plantId, env);
  const [moistureHistory, rawHistories] = await Promise.all([
    metricHistory(plantId, query, env),
    rawMetricHistories(plantId, query, env),
  ]);

  return {
    plant,
    moistureHistory: moistureHistory ?? { metrics: [], totalCount: 0 },
    moistureSource: metricType && range ? {
      metric_type: metricType,
      direction: getMoistureDirection(metricType)!,
      p5: range.lower,
      p95: range.upper,
    } : null,
    rawMetricHistories: rawHistories,
  };
}

export async function deleteMetrics(plantId: number, c: AppContext): Promise<Response> {
  if (!(await plantExists(plantId, c))) return c.json({ error: "Plant not found." }, 404);
  await db(c.env.DB).delete(metricsTable).where(eq(metricsTable.plantId, plantId)).run();
  return new Response(null, { status: 204 });
}

export async function deleteMetric(plantId: number, metricId: number, c: AppContext): Promise<Response> {
  const result = await db(c.env.DB).delete(metricsTable).where(and(eq(metricsTable.id, metricId), eq(metricsTable.plantId, plantId))).run();
  return result.meta.changes === 1 ? new Response(null, { status: 204 }) : c.json({ error: "Metric not found." }, 404);
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
  const metric = result.results[0];
  return metric
    ? c.json({ metric: { ...metric, created_at: toUtcIsoTimestamp(metric.created_at) } }, 201)
    : c.json({ error: "Could not create metric." }, 500);
}
