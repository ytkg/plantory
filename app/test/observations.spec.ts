import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { metricHistory, plantObservationData } from "../src/services/observations";
import initialSchema from "../migrations/0001_initial_schema.sql?raw";

const query = { from: "2026-09-02", to: "2026-09-02", limit: 1 };

async function insertMetric(type: string, value: number, createdAt: string | null) {
  await env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (1, ?, ?, ?)")
    .bind(type, value, createdAt).run();
}

describe("plant observation data", () => {
  beforeAll(async () => {
    await env.DB.batch(initialSchema.split(";").filter((sql) => sql.trim()).map((sql) => env.DB.prepare(sql)));
  });
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM metrics"),
      env.DB.prepare("DELETE FROM plants"),
      env.DB.prepare("INSERT INTO plants (id, name) VALUES (1, 'test plant')"),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["soil_moisture", "weight"])("loads normalization once per request for %s and includes future readings", async (metricType) => {
    await insertMetric(metricType, 0, "2026-09-01 14:59:59");
    await insertMetric(metricType, 50, "2026-09-01 15:00:00");
    await insertMetric(metricType, 75, "2026-09-02 14:59:59");
    await insertMetric(metricType, 100, "2026-09-02 15:00:00");
    await insertMetric(metricType, 10000, "2999-01-01 00:00:00");
    await insertMetric("temperature", 22, "2026-09-01 15:00:00");
    if (metricType === "soil_moisture") {
      await insertMetric("weight", 1000, "2026-09-01 15:00:00");
      await insertMetric("weight", 2000, "2026-09-02 14:59:59");
    }

    const prepare = vi.spyOn(env.DB, "prepare");
    const observation = await plantObservationData(1, query, env);
    // Count the actual D1 query that reads both water metric types without a limit.
    const sourceQueries = () => prepare.mock.calls.filter(([sql]) => /"metric_type" in \(/.test(sql));
    expect(sourceQueries()).toHaveLength(1);
    expect(observation?.moistureSource).toEqual({
      metric_type: metricType,
      direction: metricType === "weight" ? "increasing" : "decreasing",
      p5: expect.closeTo(10), p95: expect.closeTo(8020),
    });
    expect(observation?.moistureHistory).toEqual({
      metrics: [{ id: 3, plant_id: 1, value: metricType === "weight" ? 1 : 99, created_at: "2026-09-02T14:59:59Z" }],
      totalCount: 5,
    });
    expect(observation?.rawMetricHistories.find((history) => history.metric_type === metricType)).toEqual({
      metric_type: metricType,
      metrics: [{ id: 3, plant_id: 1, metric_type: metricType, value: 75, created_at: "2026-09-02T14:59:59Z" }],
      totalCount: 5,
    });
    expect(await metricHistory(1, query, env)).toEqual(observation?.moistureHistory);
    expect(sourceQueries()).toHaveLength(2);

    // A later request must observe new data instead of reusing a cross-request cache.
    await insertMetric(metricType, 200, "2026-09-01 00:00:00");
    const next = await plantObservationData(1, query, env);
    expect(sourceQueries()).toHaveLength(3);
    expect(next?.moistureHistory.totalCount).toBe(6);
    expect(next?.moistureSource?.p95).toBeCloseTo(7550);
    expect(next?.moistureHistory.metrics[0].value).toBe(metricType === "weight" ? 1 : 99);
  });

  it.each([{ values: [] }, { values: [50] }, { values: [50, 50] }])("keeps empty or degenerate ranges $values consistent with standalone history", async ({ values }) => {
    for (const value of values) await insertMetric("weight", value, "2026-09-01 15:00:00");
    const observation = await plantObservationData(1, query, env);
    expect(observation?.moistureSource).toBeNull();
    expect(observation?.moistureHistory).toEqual({ metrics: [], totalCount: values.length });
    expect(await metricHistory(1, query, env)).toEqual(observation?.moistureHistory);
  });

  it("retains undated readings in normalization while filtering dated history", async () => {
    await insertMetric("weight", 0, null);
    await insertMetric("weight", 100, "2026-09-01 15:00:00");
    const observation = await plantObservationData(1, query, env);
    expect(observation?.moistureSource).toMatchObject({ p5: 5, p95: 95 });
    expect(observation?.moistureHistory).toMatchObject({ metrics: [{ value: 100 }], totalCount: 2 });
    expect(await metricHistory(1, query, env)).toEqual(observation?.moistureHistory);
  });

  it("returns null for a missing plant without loading metrics", async () => {
    const prepare = vi.spyOn(env.DB, "prepare");
    expect(await metricHistory(999, query, env)).toBeNull();
    expect(await plantObservationData(999, query, env)).toBeNull();
    expect(prepare.mock.calls.every(([sql]) => !sql.includes('from "metrics"'))).toBe(true);
  });
});
