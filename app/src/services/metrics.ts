import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { metrics as metricsTable } from "../db/schema";
import type { AppContext } from "../routes/context";
import { toUtcIsoTimestamp } from "../time";
import type { Metric, Plant } from "../types";
import { isJsonObject, type HistoryQuery, type RawMetricQuery } from "../validation";
import { getPlantData, plantExists } from "./plants";

type RawMetricReading = Pick<Metric, "id" | "plant_id" | "metric_type" | "value"> & { created_at: string };
export type RawMetricHistory = { metric_type: string; metrics: RawMetricReading[]; totalCount: number };
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

const metricColumns = { id: metricsTable.id, plant_id: metricsTable.plantId, metric_type: metricsTable.metricType, value: metricsTable.value, created_at: metricsTable.createdAt };
const newestFirst = [desc(metricsTable.createdAt), desc(metricsTable.id)];

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
      .select(metricColumns)
      .from(metricsTable)
      .where(and(eq(metricsTable.plantId, plantId), eq(metricsTable.metricType, metric_type), recordedAtOrBeforeNow))
      .orderBy(...newestFirst)
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
  const plant = await getPlantData(plantId, env);
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
    .select(metricColumns)
    .from(metricsTable)
    .where(and(...conditions))
    .orderBy(...newestFirst)
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

export async function waterMetrics(plantId: number, env: Env): Promise<Metric[]> {
  return await db(env.DB).select(metricColumns).from(metricsTable)
    .where(and(eq(metricsTable.plantId, plantId), inArray(metricsTable.metricType, ["soil_moisture", "weight"]), recordedAtOrBeforeNow))
    .orderBy(...newestFirst).all() as Metric[];
}

// History dates are inclusive JST calendar days; rawMetricPage uses UTC instants.
export async function metricHistoryReadings(plantId: number, metricType: string, query: HistoryQuery, env: Env): Promise<Metric[]> {
  const conditions = [
    eq(metricsTable.plantId, plantId),
    eq(metricsTable.metricType, metricType),
    recordedAtOrBeforeNow,
    query.from ? sql`datetime(${metricsTable.createdAt}) >= datetime(${query.from}, '-9 hours')` : undefined,
    query.to ? sql`datetime(${metricsTable.createdAt}) < datetime(${query.to}, '+1 day', '-9 hours')` : undefined,
  ];
  return await db(env.DB).select(metricColumns).from(metricsTable)
    .where(and(...conditions)).orderBy(...newestFirst).limit(query.limit).all() as Metric[];
}

export async function rawMetricHistories(plantId: number, query: HistoryQuery, env: Env): Promise<RawMetricHistory[]> {
  const metricTypes = await metricTypeCounts(plantId, env);
  return Promise.all(metricTypes.map(async ({ metric_type, totalCount }) => ({
    metric_type,
    metrics: (await metricHistoryReadings(plantId, metric_type, query, env)).map(rawReading),
    totalCount,
  })));
}

export async function deleteMetrics(plantId: number, c: AppContext): Promise<Response> {
  if (!(await plantExists(plantId, c.env))) return c.json({ error: "Plant not found." }, 404);
  await db(c.env.DB).delete(metricsTable).where(eq(metricsTable.plantId, plantId)).run();
  return new Response(null, { status: 204 });
}

export async function deleteMetric(plantId: number, metricId: number, c: AppContext): Promise<Response> {
  const result = await db(c.env.DB).delete(metricsTable).where(and(eq(metricsTable.id, metricId), eq(metricsTable.plantId, plantId))).run();
  return result.meta.changes === 1 ? new Response(null, { status: 204 }) : c.json({ error: "Metric not found." }, 404);
}

export async function createMetric(plantId: number, c: AppContext): Promise<Response> {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON." }, 400);
  }
  if (!isJsonObject(input) || typeof input.metric_type !== "string" || !/^[a-z][a-z0-9_]{0,49}$/.test(input.metric_type)) {
    return c.json({ error: "metric_type must be 1 to 50 lowercase letters, numbers, or underscores." }, 400);
  }
  if (typeof input.value !== "number" || !Number.isFinite(input.value)) return c.json({ error: "value must be a finite number." }, 400);
  if (!(await plantExists(plantId, c.env))) return c.json({ error: "Plant not found." }, 404);

  const result = await db(c.env.DB).insert(metricsTable).values({ plantId, metricType: input.metric_type, value: input.value, createdAt: sql`CURRENT_TIMESTAMP` }).returning(metricColumns).all();
  const metric = result[0] as Metric | undefined;
  return metric
    ? c.json({ metric: { ...metric, created_at: toUtcIsoTimestamp(metric.created_at) } }, 201)
    : c.json({ error: "Could not create metric." }, 500);
}
