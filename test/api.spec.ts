import { env, SELF } from "cloudflare:test";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const baseUrl = "https://plantory.test";
const writeKey = "plnt_test_write_key";
const readKey = "plnt_test_read_key";

const schemaQueries = [
  `CREATE TABLE plants (
    id INTEGER PRIMARY KEY,
    name TEXT,
    created_at DATETIME,
    updated_at DATETIME
  )`,
  `CREATE TABLE metrics (
    id INTEGER PRIMARY KEY,
    plant_id INTEGER,
    metric_type TEXT,
    value REAL,
    created_at DATETIME,
    FOREIGN KEY (plant_id) REFERENCES plants(id)
  )`,
  `CREATE TABLE daily_reports (
    id INTEGER PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    revoked_at DATETIME
  )`,
];

async function hashApiKey(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(`test-api-key-pepper:${key}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return SELF.fetch(new Request(`${baseUrl}${path}`, init));
}

function withApiKey(key: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${key}`,
    },
  };
}

function mockSignedInSession(): void {
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.href === "https://auth.takagi.dev/verify") {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.reject(new Error(`Unexpected outbound request: ${url}`));
  });
}

describe("Plantory API", () => {
  beforeAll(async () => {
    await env.DB.batch(schemaQueries.map((query) => env.DB.prepare(query)));
  });

  beforeEach(async () => {
    vi.unstubAllGlobals();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM metrics"),
      env.DB.prepare("DELETE FROM daily_reports"),
      env.DB.prepare("DELETE FROM plants"),
      env.DB.prepare("DELETE FROM api_keys"),
    ]);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO api_keys (name, key_hash, scope) VALUES (?, ?, ?)")
        .bind("test write key", await hashApiKey(writeKey), "write"),
      env.DB.prepare("INSERT INTO api_keys (name, key_hash, scope) VALUES (?, ?, ?)")
        .bind("test read key", await hashApiKey(readKey), "read"),
    ]);
  });

  afterAll(() => vi.unstubAllGlobals());

  it("rejects a protected API request without credentials", async () => {
    const response = await request("/api/plants");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication is required." });
  });

  it("returns public moisture status using soil moisture first and weight as fallback", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("カランコエ"),
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("苔玉"),
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("記録なし"),
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("丸葉"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(1, "soil_moisture", 20),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(1, "soil_moisture", 80),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(1, "weight", 10),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(1, "weight", 90),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(2, "weight", 81),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(2, "weight", 89),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(4, "weight", 1),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(4, "weight", 4),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(4, "weight", 2),
    ]);

    const response = await request("/api/status");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { name: "丸葉", moisture: 33 },
      { name: "苔玉", moisture: 100 },
      { name: "カランコエ", moisture: 100 },
    ]);
  });

  it("rejects non-GET requests to public status", async () => {
    const response = await request("/api/status", { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("serves shared browser UI modules as static assets", async () => {
    const response = await request("/api-client.js");

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("export async function requestJson");

    const uiResponse = await request("/ui.js");
    expect(uiResponse.status).toBe(200);
    await expect(uiResponse.text()).resolves.toContain("export function listStateCard");
  });

  it("publishes one aggregate observation per date and updates it on a rerun", async () => {
    const created = await request(
      "/api/reports/2026-09-04",
      withApiKey(writeKey, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "カランコエは元気です。" }),
      }),
    );
    expect(created.status).toBe(200);

    const updated = await request(
      "/api/reports/2026-09-04",
      withApiKey(writeKey, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "カランコエとエゾ松の苔玉は穏やかです。" }),
      }),
    );
    expect(updated.status).toBe(200);

    const listed = await request("/api/reports");
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({
      reports: [expect.objectContaining({ date: "2026-09-04", content: "カランコエとエゾ松の苔玉は穏やかです。" })],
    });
  });

  it("does not allow a read key to update an observation", async () => {
    const response = await request(
      "/api/reports/2026-09-04",
      withApiKey(readKey, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "更新できないはずです。" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("allows a write key to create a plant and a read key to list it", async () => {
    const created = await request(
      "/api/plants",
      withApiKey(writeKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "カランコエ" }),
      }),
    );

    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ plant: { id: 1, name: "カランコエ" } });

    const listed = await request("/api/plants", withApiKey(readKey));
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({ plants: [{ id: 1, name: "カランコエ" }] });
  });

  it("does not allow a read key to create a plant", async () => {
    const response = await request(
      "/api/plants",
      withApiKey(readKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "エゾ松の苔玉" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("records and returns metrics for a plant", async () => {
    const plant = await request(
      "/api/plants",
      withApiKey(writeKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "モンステラ" }),
      }),
    );
    const { plant: createdPlant } = (await plant.json()) as { plant: { id: number } };

    const metric = await request(
      `/api/plants/${createdPlant.id}/metrics`,
      withApiKey(writeKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric_type: "soil_moisture", value: 62.4 }),
      }),
    );
    expect(metric.status).toBe(201);
    await expect(metric.json()).resolves.toMatchObject({
      metric: { plant_id: createdPlant.id, metric_type: "soil_moisture", value: 62.4 },
    });

    const earlierMetric = await request(
      `/api/plants/${createdPlant.id}/metrics`,
      withApiKey(writeKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric_type: "soil_moisture", value: 48 }),
      }),
    );
    expect(earlierMetric.status).toBe(201);

    const listed = await request(`/api/plants/${createdPlant.id}/metrics`, withApiKey(readKey));
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      metrics: [
        { plant_id: createdPlant.id, metric_type: "soil_moisture", value: 48 },
        { plant_id: createdPlant.id, metric_type: "soil_moisture", value: 62.4 },
      ],
      metricRanges: { soil_moisture: { min: 48, max: 62.4 } },
    });
  });

  it("validates metrics before writing them", async () => {
    await env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("シダ").run();

    const response = await request(
      "/api/plants/1/metrics",
      withApiKey(writeKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric_type: "Soil Moisture", value: 50 }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "metric_type must be 1 to 50 lowercase letters, numbers, or underscores.",
    });
  });

  it("only permits deleting a revoked API key from a signed-in session", async () => {
    await env.DB.prepare(
      "INSERT INTO api_keys (name, key_hash, scope, revoked_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
    )
      .bind("revoked key", await hashApiKey("plnt_revoked_key"), "read")
      .run();
    const revoked = await env.DB.prepare("SELECT id FROM api_keys WHERE name = ?")
      .bind("revoked key")
      .first<{ id: number }>();
    expect(revoked).not.toBeNull();

    mockSignedInSession();
    const response = await request(`/api/api-keys/${revoked!.id}`, {
      method: "DELETE",
      headers: { Cookie: "plantory_access=test-access-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    await expect(
      env.DB.prepare("SELECT id FROM api_keys WHERE id = ?").bind(revoked!.id).first(),
    ).resolves.toBeNull();
  });
});
