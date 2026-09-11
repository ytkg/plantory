import { calculateMoisturePercentage, calculateMoistureRange, getMoistureDirection, type MoistureRange } from "../moisture";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
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

const recordedAtOrBeforeNow = or(
  isNull(metricsTable.createdAt),
  sql`julianday(${metricsTable.createdAt}) <= julianday(CURRENT_TIMESTAMP)`,
);

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

async function metricTypeCounts(plantId: number, env: Env): Promise<Array<{ metric_type: string; totalCount: number }>> {
  const types = await db(env.DB)
    .select({ metric_type: metricsTable.metricType, total_count: count() })
    .from(metricsTable)
    .where(eq(metricsTable.plantId, plantId))
    .groupBy(metricsTable.metricType)
    .orderBy(asc(metricsTable.metricType))
    .all();
  return types.flatMap(({ metric_type, total_count }) => metric_type === null ? [] : [{ metric_type, totalCount: total_count }]);
}

async function rawMetricTypes(plantId: number, env: Env): Promise<RawMetricType[]> {
  const types = await metricTypeCounts(plantId, env);
  return Promise.all(types.map(async ({ metric_type, totalCount }) => {
    const result = await db(env.DB)
      .select({ id: metricsTable.id, plant_id: metricsTable.plantId, metric_type: metricsTable.metricType, value: metricsTable.value, created_at: metricsTable.createdAt })
      .from(metricsTable)
      .where(and(eq(metricsTable.plantId, plantId), eq(metricsTable.metricType, metric_type), recordedAtOrBeforeNow))
      .orderBy(desc(metricsTable.createdAt), desc(metricsTable.id))
      .limit(2)
      .all() as Metric[];
    return {
      metric_type,
      totalCount,
      latest: result[0] ? rawReading(result[0]) : null,
      previous: result[1] ? rawReading(result[1]) : null,
    };
  }));
}

export async function rawMetricPage(plantId: number, query: RawMetricQuery, env: Env): Promise<RawMetricPage | null> {
  const plant = await db(env.DB).select({ id: plants.id, name: plants.name, created_at: plants.createdAt, updated_at: plants.updatedAt }).from(plants).where(eq(plants.id, plantId)).limit(1).get() as Plant | undefined;
  if (!plant) return null;

  const metricTypes = await rawMetricTypes(plantId, env);
  const selected = metricTypes.find((type) => type.metric_type === query.metricType);
  if (!selected) {
    return { plant, metricTypes, metric_type: query.metricType, metrics: [], totalCount: 0, nextCursor: null };
  }

  const conditions = [
    eq(metricsTable.plantId, plantId),
    eq(metricsTable.metricType, query.metricType),
    query.from ? sql`julianday(${metricsTable.createdAt}) >= julianday(${query.from})` : undefined,
    query.to ? sql`julianday(${metricsTable.createdAt}) <= julianday(${query.to})` : undefined,
    query.cursor ? or(
      sql`julianday(${metricsTable.createdAt}) < julianday(${query.cursor.createdAt})`,
      and(sql`julianday(${metricsTable.createdAt}) = julianday(${query.cursor.createdAt})`, sql`${metricsTable.id} < ${query.cursor.id}`),
    ) : undefined,
  ];
  const result = await db(env.DB)
    .select({ id: metricsTable.id, plant_id: metricsTable.plantId, metric_type: metricsTable.metricType, value: metricsTable.value, created_at: metricsTable.createdAt })
    .from(metricsTable)
    .where(and(...conditions))
    .orderBy(desc(metricsTable.createdAt), desc(metricsTable.id))
    .limit(query.limit + 1)
    .all() as Metric[];
  const hasMore = result.length > query.limit;
  const metrics = result.slice(0, query.limit).map(rawReading);
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
  const allWaterMetrics = await db(env.DB).select({ id: metricsTable.id, plant_id: metricsTable.plantId, metric_type: metricsTable.metricType, value: metricsTable.value, created_at: metricsTable.createdAt }).from(metricsTable).where(and(eq(metricsTable.plantId, plantId), inArray(metricsTable.metricType, ["soil_moisture", "weight"]), recordedAtOrBeforeNow)).orderBy(desc(metricsTable.createdAt), desc(metricsTable.id)).all() as Metric[];
  const metricType: WaterMetricType | null = allWaterMetrics.some((metric) => metric.metric_type === "soil_moisture")
    ? "soil_moisture"
    : allWaterMetrics.some((metric) => metric.metric_type === "weight") ? "weight" : null;
  const metrics = metricType ? allWaterMetrics.filter((metric) => metric.metric_type === metricType) : [];
  return { metricType, metrics, range: calculateMoistureRange(metrics.map((metric) => metric.value)) };
}

export async function metricHistory(plantId: number, query: HistoryQuery, env: Env): Promise<MetricHistory | null> {
  if (!(await db(env.DB).select({ id: plants.id }).from(plants).where(eq(plants.id, plantId)).limit(1).get())) return null;

  const { metricType, metrics: sourceMetrics, range } = await resolveMoistureMetricSource(plantId, env);

  if (!metricType || !range) return { metrics: [], totalCount: sourceMetrics.length };

  const conditions = [
    eq(metricsTable.plantId, plantId),
    eq(metricsTable.metricType, metricType),
    recordedAtOrBeforeNow,
    query.from ? sql`datetime(${metricsTable.createdAt}) >= datetime(${query.from}, '-9 hours')` : undefined,
    query.to ? sql`datetime(${metricsTable.createdAt}) < datetime(${query.to}, '+1 day', '-9 hours')` : undefined,
  ];
  const result = await db(env.DB)
    .select({ id: metricsTable.id, plant_id: metricsTable.plantId, metric_type: metricsTable.metricType, value: metricsTable.value, created_at: metricsTable.createdAt })
    .from(metricsTable)
    .where(and(...conditions))
    .orderBy(desc(metricsTable.createdAt), desc(metricsTable.id))
    .limit(query.limit)
    .all() as Metric[];
  const metrics = result.flatMap((metric): MoistureMetric[] => {
    const value = calculateMoisturePercentage(metric.value, range, metricType);
    return value === null ? [] : [{ id: metric.id, plant_id: metric.plant_id, value, created_at: toUtcIsoTimestamp(metric.created_at) }];
  });
  return { metrics, totalCount: sourceMetrics.length };
}

async function rawMetricHistories(plantId: number, query: HistoryQuery, env: Env): Promise<RawMetricHistory[]> {
  const metricTypes = await metricTypeCounts(plantId, env);

  return Promise.all(metricTypes.map(async ({ metric_type, totalCount }) => {
    const conditions = [
      eq(metricsTable.plantId, plantId),
      eq(metricsTable.metricType, metric_type),
      recordedAtOrBeforeNow,
      query.from ? sql`datetime(${metricsTable.createdAt}) >= datetime(${query.from}, '-9 hours')` : undefined,
      query.to ? sql`datetime(${metricsTable.createdAt}) < datetime(${query.to}, '+1 day', '-9 hours')` : undefined,
    ];
    const result = await db(env.DB)
      .select({ id: metricsTable.id, plant_id: metricsTable.plantId, metric_type: metricsTable.metricType, value: metricsTable.value, created_at: metricsTable.createdAt })
      .from(metricsTable)
      .where(and(...conditions))
      .orderBy(desc(metricsTable.createdAt), desc(metricsTable.id))
      .limit(query.limit)
      .all() as Metric[];
    return {
      metric_type,
      metrics: result.map(rawReading),
      totalCount,
    };
  }));
}

export async function plantObservationData(plantId: number, query: HistoryQuery, env: Env): Promise<PlantObservationData | null> {
  const plant = await db(env.DB).select({ id: plants.id, name: plants.name, created_at: plants.createdAt, updated_at: plants.updatedAt }).from(plants).where(eq(plants.id, plantId)).limit(1).get() as Plant | undefined;
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

  const result = await db(c.env.DB).insert(metricsTable).values({ plantId, metricType: input.metric_type, value: input.value, createdAt: sql`CURRENT_TIMESTAMP` }).returning({ id: metricsTable.id, plant_id: metricsTable.plantId, metric_type: metricsTable.metricType, value: metricsTable.value, created_at: metricsTable.createdAt }).all();
  const metric = result[0] as Metric | undefined;
  return metric
    ? c.json({ metric: { ...metric, created_at: toUtcIsoTimestamp(metric.created_at) } }, 201)
    : c.json({ error: "Could not create metric." }, 500);
}
