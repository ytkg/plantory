import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiKey } from "../src/auth";
import apiKeysMigration from "../migrations/0002_create_api_keys.sql?raw";
import settingsMigration from "../migrations/20260910145302_metrics_settings.sql?raw";

const url = "https://plantory.test/api/settings/metrics";
const session = { Cookie: "plantory_access=test-access" };
const readKey = "plnt_settings_read";
const writeKey = "plnt_settings_write";
const keyHeaders = (key: string) => ({ Authorization: `Bearer ${key}` });
const get = (headers = session) => SELF.fetch(url, { headers });
const put = (input: unknown, headers = session) => SELF.fetch(url, {
  method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(input),
});

describe("metrics settings", () => {
  beforeAll(async () => {
    await env.DB.batch([env.DB.prepare(apiKeysMigration), env.DB.prepare(settingsMigration)]);
    for (const [key, scope] of [[readKey, "read"], [writeKey, "write"]]) {
      await env.DB.prepare("INSERT INTO api_keys (name, key_hash, scope) VALUES (?, ?, ?)")
        .bind(scope, await hashApiKey(key, env), scope).run();
    }
  });
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM metrics_settings").run();
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      const requestUrl = new URL(input instanceof Request ? input.url : input.toString());
      if (requestUrl.href === "https://auth.takagi.dev/verify") return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.reject(new Error(`Unexpected outbound request: ${requestUrl}`));
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the default without creating a settings row", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ interval_hours: 3 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM metrics_settings").first("count")).toBe(0);
  });

  it("lets both API key scopes read and only a signed-in session change settings", async () => {
    expect((await SELF.fetch(url)).status).toBe(401);
    expect((await SELF.fetch(url, { method: "PUT", body: '{"interval_hours":6}' })).status).toBe(401);
    for (const key of [readKey, writeKey]) {
      expect((await SELF.fetch(url, { headers: keyHeaders(key) })).status).toBe(200);
      expect((await SELF.fetch(url, { method: "PUT", headers: keyHeaders(key), body: '{"interval_hours":6}' })).status).toBe(401);
    }
    expect((await put({ interval_hours: 6 })).status).toBe(200);
    await expect((await SELF.fetch(url, { headers: keyHeaders(writeKey) })).json()).resolves.toEqual({ interval_hours: 6 });
  });

  it("stores all eight intervals as one global setting and returns changes immediately", async () => {
    for (const hours of [1, 2, 3, 4, 6, 8, 12, 24, 3]) {
      const response = await put({ interval_hours: hours });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ interval_hours: hours });
      await expect((await get()).json()).resolves.toEqual({ interval_hours: hours });
      expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM metrics_settings").first("count")).toBe(1);
    }
  });

  it.each([0, -1, 5, 7, 9, 25, 1.5, "3", null, true, [], {}])("rejects invalid interval %j without replacing the previous value", async (hours) => {
    await put({ interval_hours: 6 });
    expect((await put({ interval_hours: hours })).status).toBe(400);
    await expect((await get()).json()).resolves.toEqual({ interval_hours: 6 });
  });

  it.each([null, [], {}, 3, "3", true])("rejects malformed input %j", async (input) => {
    expect((await put(input)).status).toBe(400);
    await expect((await get()).json()).resolves.toEqual({ interval_hours: 3 });
  });

  it("rejects malformed JSON and unsupported methods", async () => {
    expect((await SELF.fetch(url, { method: "PUT", headers: session, body: "{" })).status).toBe(400);
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const response = await SELF.fetch(url, { method, headers: session });
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET, PUT");
    }
  });

  it("enforces allowed intervals and the singleton in the actual migration", async () => {
    await expect(env.DB.prepare("INSERT INTO metrics_settings (id, interval_hours) VALUES (1, 5)").run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO metrics_settings (id, interval_hours) VALUES (2, 3)").run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO metrics_settings (id, interval_hours) VALUES (1, NULL)").run()).rejects.toThrow();
    await env.DB.prepare("INSERT INTO metrics_settings (id) VALUES (1)").run();
    await expect(env.DB.prepare("UPDATE metrics_settings SET interval_hours = 1.5 WHERE id = 1").run()).rejects.toThrow();
    await expect((await get()).json()).resolves.toEqual({ interval_hours: 3 });
  });

  it("protects the settings page and serves its form to signed-in users", async () => {
    const anonymous = await SELF.fetch("https://plantory.test/settings/metrics", { redirect: "manual" });
    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.get("Location")).toBe("https://plantory.test/login?next=%2Fsettings%2Fmetrics");
    expect((await SELF.fetch("https://plantory.test/metrics-settings.html")).status).toBe(404);
    const response = await SELF.fetch("https://plantory.test/settings/metrics", { headers: session });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="metrics-settings-form"');
    expect(html.match(/<option value=/g)).toHaveLength(8);
    expect(html).toContain('href="/settings/metrics" aria-current="page"');
    expect((await SELF.fetch("https://plantory.test/metrics-settings.js")).status).toBe(200);
  });
});
