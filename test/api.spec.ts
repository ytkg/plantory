import { env, SELF } from "cloudflare:test";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src";

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
  `CREATE TABLE environment_metrics (
    id INTEGER PRIMARY KEY,
    temperature REAL NOT NULL,
    humidity REAL NOT NULL,
    co2 INTEGER NOT NULL,
    created_at DATETIME NOT NULL
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

async function mcpRequest(id: number, method: string, params: unknown, key = readKey): Promise<Response> {
  return request("/mcp", withApiKey(key, {
    method: "POST",
    headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  }));
}

async function mcpJson(response: Response): Promise<unknown> {
  const body = await response.text();
  const data = body.match(/^data:\s*(.+)$/m)?.[1] ?? body;
  return JSON.parse(data);
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
      env.DB.prepare("DELETE FROM environment_metrics"),
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

  it("serves the Markdown renderer assets used by observation reports", async () => {
    const [index, marked, purifier] = await Promise.all([
      request("/"),
      request("/marked.umd.js"),
      request("/purify.min.js"),
    ]);

    expect(index.status).toBe(200);
    expect(await index.text()).toContain('src="/marked.umd.js"');
    expect(marked.status).toBe(200);
    expect(await marked.text()).toContain("marked");
    expect(purifier.status).toBe(200);
    expect(await purifier.text()).toContain("DOMPurify");
  });

  it("exposes Plantory data tools through MCP and only exposes report saving to write credentials", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("カランコエ"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)")
        .bind(1, "soil_moisture", 80, "2026-09-01 15:00:00"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)")
        .bind(1, "soil_moisture", 40, "2026-09-02 15:00:00"),
    ]);

    expect((await request("/mcp", { method: "POST" })).status).toBe(401);

    const initialized = await mcpRequest(1, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "plantory-test", version: "1.0.0" },
    });
    expect(initialized.status).toBe(200);
    await expect(mcpJson(initialized)).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "plantory", version: "0.1.0" } },
    });

    const tools = await mcpRequest(2, "tools/list", {});
    expect(tools.status).toBe(200);
    const toolsResponse = await mcpJson(tools) as { result: { tools: Array<{ name: string }> } };
    expect(toolsResponse.result.tools.map((tool) => tool.name)).toEqual([
      "list_plants",
      "get_plant_moisture_history",
      "get_plant_observation_data",
      "get_environment_history",
      "get_daily_weather",
      "get_observation_reports",
    ]);

    const history = await mcpRequest(3, "tools/call", {
      name: "get_plant_moisture_history",
      arguments: { plant_id: 1, from: "2026-09-02", to: "2026-09-02" },
    });
    expect(history.status).toBe(200);
    const historyResponse = await mcpJson(history) as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(historyResponse.result.content[0].text)).toMatchObject({
      metrics: [{ value: 0, created_at: "2026-09-01T15:00:00Z" }],
      totalCount: 2,
    });

    const observation = await mcpRequest(4, "tools/call", {
      name: "get_plant_observation_data",
      arguments: { plant_id: 1, from: "2026-09-02", to: "2026-09-02" },
    });
    expect(observation.status).toBe(200);
    const observationResponse = await mcpJson(observation) as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(observationResponse.result.content[0].text)).toMatchObject({
      plant: { id: 1, name: "カランコエ" },
      moistureHistory: { metrics: [{ value: 0, created_at: "2026-09-01T15:00:00Z" }], totalCount: 2 },
      moistureSource: { metric_type: "soil_moisture", direction: "decreasing", p5: 42, p95: 78 },
      rawMetricHistories: [{
        metric_type: "soil_moisture",
        totalCount: 2,
        metrics: [{ value: 80, created_at: "2026-09-01T15:00:00Z" }],
      }],
    });

    const writeTools = await mcpRequest(5, "tools/list", {}, writeKey);
    const writeToolsResponse = await mcpJson(writeTools) as { result: { tools: Array<{ name: string }> } };
    expect(writeToolsResponse.result.tools.map((tool) => tool.name)).toContain("upsert_observation_report");

    const saved = await mcpRequest(6, "tools/call", {
      name: "upsert_observation_report",
      arguments: { date: "2026-09-03", content: "土壌水分の変化を記録した。" },
    }, writeKey);
    const savedResponse = await mcpJson(saved) as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(savedResponse.result.content[0].text)).toMatchObject({
      report: { date: "2026-09-03", content: "土壌水分の変化を記録した。" },
    });

    const reports = await mcpRequest(7, "tools/call", { name: "get_observation_reports", arguments: {} });
    const reportsResponse = await mcpJson(reports) as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(reportsResponse.result.content[0].text)).toMatchObject({
      reports: [{ date: "2026-09-03", content: "土壌水分の変化を記録した。" }],
    });
  });

  it("sets session cookies when logging in and clears both when logging out", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === "https://auth.takagi.dev/login") {
        return Promise.resolve(Response.json({ accessToken: "access-token", refreshToken: "refresh-token", expiresIn: 900 }));
      }
      return Promise.reject(new Error(`Unexpected outbound request: ${url}`));
    });

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ytkg", password: "password" }),
    });
    expect(login.status).toBe(200);
    expect(login.headers.get("Set-Cookie")).toContain("plantory_access=access-token");
    expect(login.headers.get("Set-Cookie")).toContain("plantory_refresh=refresh-token");

    const logout = await request("/api/auth/logout", { method: "POST" });
    expect(logout.status).toBe(200);
    expect(logout.headers.get("Set-Cookie")).toContain("plantory_access=");
    expect(logout.headers.get("Set-Cookie")).toContain("plantory_refresh=");
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("collects one SwitchBot environment snapshot on a scheduled run", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        Response.json({
          statusCode: 100,
          body: { temperature: 24.3, humidity: 58, CO2: 741 },
        }),
      ),
    );

    await worker.scheduled!(
      { cron: "0 * * * *", scheduledTime: Date.now(), noRetry: vi.fn() },
      env,
      {} as ExecutionContext,
    );

    const { results } = await env.DB.prepare(
      "SELECT temperature, humidity, co2, created_at FROM environment_metrics ORDER BY id ASC",
    ).all<{ temperature: number; humidity: number; co2: number; created_at: string }>();
    expect(results).toEqual([
      expect.objectContaining({ temperature: 24.3, humidity: 58, co2: 741 }),
    ]);
    expect(new Date(results[0].created_at).getTime()).not.toBeNaN();
  });

  it.each([
    [{ temperature: 24.3, humidity: 58 }],
    [{ temperature: 24.3, humidity: "58", CO2: 741 }],
  ])("does not save partial or invalid SwitchBot readings", async (body) => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ statusCode: 100, body })));

    await worker.scheduled!(
      { cron: "0 * * * *", scheduledTime: Date.now(), noRetry: vi.fn() },
      env,
      {} as ExecutionContext,
    );

    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM environment_metrics").first<{ count: number }>()).resolves.toEqual({ count: 0 });
  });

  it("does not save readings when the SwitchBot request fails", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 503 })));

    await worker.scheduled!(
      { cron: "0 * * * *", scheduledTime: Date.now(), noRetry: vi.fn() },
      env,
      {} as ExecutionContext,
    );

    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM environment_metrics").first<{ count: number }>()).resolves.toEqual({ count: 0 });
  });

  it("logs the cause when the SwitchBot request throws", async () => {
    const error = new Error("network unavailable");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", () => Promise.reject(error));

    await worker.scheduled!(
      { cron: "0 * * * *", scheduledTime: Date.now(), noRetry: vi.fn() },
      env,
      {} as ExecutionContext,
    );

    expect(errorSpy).toHaveBeenCalledWith("SwitchBot API request failed", error);
    errorSpy.mockRestore();
  });

  it("logs the HTTP status when the SwitchBot request is unsuccessful", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 503 })));

    await worker.scheduled!(
      { cron: "0 * * * *", scheduledTime: Date.now(), noRetry: vi.fn() },
      env,
      {} as ExecutionContext,
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("status=503"));
    errorSpy.mockRestore();
  });

  it("logs SwitchBot API errors without logging the response body", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ statusCode: 190, message: "Unauthorized", body: { token: "secret" } })));

    await worker.scheduled!(
      { cron: "0 * * * *", scheduledTime: Date.now(), noRetry: vi.fn() },
      env,
      {} as ExecutionContext,
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("statusCode=190"));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('message="Unauthorized"'));
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("secret"));
    errorSpy.mockRestore();
  });

  it("logs every invalid SwitchBot environment field", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ statusCode: 100, body: { temperature: "24.3", humidity: null } })));

    await worker.scheduled!(
      { cron: "0 * * * *", scheduledTime: Date.now(), noRetry: vi.fn() },
      env,
      {} as ExecutionContext,
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("temperature, humidity, co2"));
    errorSpy.mockRestore();
  });

  it("does not log an error for a valid SwitchBot reading", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ statusCode: 100, body: { temperature: 24.3, humidity: 58, CO2: 741 } })));

    await worker.scheduled!(
      { cron: "0 * * * *", scheduledTime: Date.now(), noRetry: vi.fn() },
      env,
      {} as ExecutionContext,
    );

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns public moisture status using soil moisture first and weight as fallback", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("カランコエ"),
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("苔玉"),
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("記録なし"),
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("丸葉"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(1, "soil_moisture", 20, "2026-09-07 00:00:00"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(1, "soil_moisture", 80, "2026-09-07 01:00:00"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(1, "weight", 10, "2026-09-07 02:00:00"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(1, "weight", 90, "2026-09-07 03:00:00"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(2, "weight", 81, "2026-09-07 04:00:00"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(2, "weight", 89, "2026-09-07 05:00:00"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(4, "weight", 1, "2026-09-07 06:00:00"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(4, "weight", 4, "2026-09-07 07:00:00"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(4, "weight", 2, "2026-09-07 08:00:00"),
    ]);

    const response = await request("/api/status");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { plant_id: 1, name: "カランコエ", moisture: 0, recorded_at: "2026-09-07T01:00:00Z" },
      { plant_id: 2, name: "苔玉", moisture: 100, recorded_at: "2026-09-07T05:00:00Z" },
      { plant_id: 4, name: "丸葉", moisture: 33, recorded_at: "2026-09-07T08:00:00Z" },
    ]);
  });

  it("rejects non-GET requests to public status", async () => {
    const response = await request("/api/status", { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("returns the latest complete room environment publicly", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO environment_metrics (temperature, humidity, co2, created_at) VALUES (?, ?, ?, ?)")
        .bind(20.5, 55, 700, "2026-09-05T00:00:00.000Z"),
      env.DB.prepare("INSERT INTO environment_metrics (temperature, humidity, co2, created_at) VALUES (?, ?, ?, ?)")
        .bind(24.3, 58, 741, "2026-09-06T00:00:00.000Z"),
    ]);

    const response = await request("/api/environment");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      environment: {
        temperature: 24.3,
        humidity: 58,
        co2: 741,
        created_at: "2026-09-06T00:00:00.000Z",
      },
    });
  });

  it("returns no room environment before the first snapshot", async () => {
    const response = await request("/api/environment");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ environment: null });
  });

  it("rejects non-GET requests to public environment", async () => {
    const response = await request("/api/environment", { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("returns authenticated room environment history within a requested date range", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO environment_metrics (temperature, humidity, co2, created_at) VALUES (?, ?, ?, ?)")
        .bind(20.5, 55, 700, "2026-09-01T14:59:59.000Z"),
      env.DB.prepare("INSERT INTO environment_metrics (temperature, humidity, co2, created_at) VALUES (?, ?, ?, ?)")
        .bind(24.3, 58, 741, "2026-09-01T15:00:00.000Z"),
    ]);

    expect((await request("/api/environment/metrics")).status).toBe(401);
    const response = await request("/api/environment/metrics?from=2026-09-02&to=2026-09-02", withApiKey(readKey));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      environmentMetrics: [{ temperature: 24.3, humidity: 58, co2: 741, created_at: "2026-09-01T15:00:00.000Z" }],
    });
  });

  it("returns authenticated daily weather for the requested period", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({
      daily: {
        time: ["2026-09-01", "2026-09-02"],
        weather_code: [1, 3],
        temperature_2m_max: [30.2, 28.4],
        temperature_2m_min: [21.1, 20.4],
        relative_humidity_2m_mean: [60, 67],
        precipitation_sum: [0, 2.4],
        sunshine_duration: [43200, 12000],
      },
    })));
    vi.stubGlobal("fetch", fetchMock);

    expect((await request("/api/weather")).status).toBe(401);
    const response = await request("/api/weather?from=2026-09-01&to=2026-09-02", withApiKey(readKey));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      weather: [
        { date: "2026-09-01", weather_code: 1, temperature_max: 30.2, temperature_min: 21.1, humidity: 60, precipitation: 0, sunshine_duration: 43200 },
        { date: "2026-09-02", weather_code: 3, temperature_max: 28.4, temperature_min: 20.4, humidity: 67, precipitation: 2.4, sunshine_duration: 12000 },
      ],
    });

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(requestUrl.origin + requestUrl.pathname).toBe("https://archive-api.open-meteo.com/v1/archive");
    expect(requestUrl.searchParams.get("start_date")).toBe("2026-09-01");
    expect(requestUrl.searchParams.get("end_date")).toBe("2026-09-02");
  });

  it("serves shared browser UI modules as static assets", async () => {
    const response = await request("/api-client.js");

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("export async function requestJson");

    const uiResponse = await request("/ui.js");
    expect(uiResponse.status).toBe(200);
    await expect(uiResponse.text()).resolves.toContain("export function listStateCard");

    const presentationResponse = await request("/presentation.js");
    expect(presentationResponse.status).toBe(200);
    await expect(presentationResponse.text()).resolves.toContain("export function formatMoisture");

    const statusResponse = await request("/status.js");
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.text()).resolves.toContain("/api/status");

    const environmentResponse = await request("/environment.js");
    expect(environmentResponse.status).toBe(200);
    await expect(environmentResponse.text()).resolves.toContain("/api/environment");
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

    const second = await request(
      "/api/plants",
      withApiKey(writeKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "エゾ松の苔玉" }),
      }),
    );
    expect(second.status).toBe(201);

    const listed = await request("/api/plants", withApiKey(readKey));
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      plants: [
        { id: 1, name: "カランコエ" },
        { id: 2, name: "エゾ松の苔玉" },
      ],
    });
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
    await expect(listed.json()).resolves.toEqual({
      metrics: [
        { id: expect.any(Number), plant_id: createdPlant.id, value: 100, created_at: expect.any(String) },
        { id: expect.any(Number), plant_id: createdPlant.id, value: 0, created_at: expect.any(String) },
      ],
      totalCount: 2,
    });
  });

  it("filters authenticated metrics by date and limits the returned history", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("履歴テスト"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(1, "soil_moisture", 60, "2026-09-01 14:59:59"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(1, "soil_moisture", 50, "2026-09-01 15:00:00"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(1, "soil_moisture", 40, "2026-09-02 15:00:00"),
    ]);

    const response = await request("/api/plants/1/metrics?from=2026-09-02&to=2026-09-02&limit=1", withApiKey(readKey));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      metrics: [{ value: 50, created_at: "2026-09-01T15:00:00Z" }],
      totalCount: 3,
    });
  });

  it("deletes all metrics while keeping the plant and other plants intact", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("カランコエ"),
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("苔玉"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(1, "soil_moisture", 40),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(1, "temperature", 22),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value) VALUES (?, ?, ?)").bind(2, "weight", 80),
    ]);

    const listed = await request("/api/plants/1/metrics", withApiKey(readKey));
    await expect(listed.json()).resolves.toMatchObject({ totalCount: 1 });

    const deleted = await request("/api/plants/1/metrics", withApiKey(writeKey, { method: "DELETE" }));
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM metrics WHERE plant_id = 1").first<{ count: number }>()).resolves.toMatchObject({ count: 0 });
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM metrics WHERE plant_id = 2").first<{ count: number }>()).resolves.toMatchObject({ count: 1 });
    await expect(env.DB.prepare("SELECT id FROM plants WHERE id = 1").first()).resolves.not.toBeNull();
  });

  it("requires write access and returns success when there are no metrics", async () => {
    await env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("空の鉢").run();
    expect((await request("/api/plants/1/metrics", { method: "DELETE" })).status).toBe(401);
    expect((await request("/api/plants/1/metrics", withApiKey(readKey, { method: "DELETE" }))).status).toBe(401);
    expect((await request("/api/plants/999/metrics", withApiKey(writeKey, { method: "DELETE" }))).status).toBe(404);
    expect((await request("/api/plants/1/metrics", withApiKey(writeKey, { method: "DELETE" }))).status).toBe(204);

    mockSignedInSession();
    expect((await request("/api/plants/1/metrics", { method: "DELETE", headers: { Cookie: "plantory_access=test-access-token" } })).status).toBe(204);
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

  it("orders metrics by measurement time before id", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO plants (name) VALUES (?)").bind("時刻テスト"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(1, "soil_moisture", 80, "2026-01-01 00:00:00"),
      env.DB.prepare("INSERT INTO metrics (plant_id, metric_type, value, created_at) VALUES (?, ?, ?, ?)").bind(1, "soil_moisture", 40, "2026-01-02 00:00:00"),
    ]);
    const response = await request("/api/plants/1/metrics", withApiKey(readKey));
    await expect(response.json()).resolves.toMatchObject({ metrics: [{ value: 100 }, { value: 0 }] });
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
