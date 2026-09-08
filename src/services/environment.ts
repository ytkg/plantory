import type { AppContext } from "../routes/context";
import { and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { environmentMetrics } from "../db/schema";
import type { HistoryQuery } from "../validation";

const SWITCHBOT_STATUS_URL = "https://api.switch-bot.com/v1.1/devices";

type EnvironmentReading = {
  temperature: number;
  humidity: number;
  co2: number;
};

export type EnvironmentSnapshot = EnvironmentReading & {
  created_at: string;
};

type SwitchBotStatus = {
  statusCode?: unknown;
  message?: unknown;
  body?: {
    temperature?: unknown;
    humidity?: unknown;
    CO2?: unknown;
  };
};

function base64Encode(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function createSwitchBotHeaders(env: Env): Promise<HeadersInit> {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const data = new TextEncoder().encode(`${env.SWITCHBOT_TOKEN}${timestamp}${nonce}`);
  const secret = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SWITCHBOT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", secret, data);

  return {
    Authorization: env.SWITCHBOT_TOKEN,
    sign: base64Encode(signature),
    t: timestamp,
    nonce,
  };
}

function invalidReadingFields(status: SwitchBotStatus): string[] {
  if (!status.body) return ["temperature", "humidity", "co2"];

  const fields: Array<[string, unknown]> = [
    ["temperature", status.body.temperature],
    ["humidity", status.body.humidity],
    ["co2", status.body.CO2],
  ];
  return fields.flatMap(([name, value]) => typeof value === "number" && Number.isFinite(value) ? [] : [name]);
}

function readingFromStatus(status: SwitchBotStatus): EnvironmentReading | null {
  if (status.statusCode !== 100 || invalidReadingFields(status).length > 0) return null;

  return {
    temperature: status.body!.temperature as number,
    humidity: status.body!.humidity as number,
    co2: status.body!.CO2 as number,
  };
}

export async function collectEnvironmentMetrics(env: Env): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`${SWITCHBOT_STATUS_URL}/${encodeURIComponent(env.SWITCHBOT_DEVICE_ID)}/status`, {
      headers: await createSwitchBotHeaders(env),
    });
  } catch (error) {
    console.error("SwitchBot API request failed", error);
    return false;
  }
  if (!response.ok) {
    console.error(`SwitchBot API request failed: status=${response.status}`);
    return false;
  }

  let status: SwitchBotStatus;
  try {
    status = (await response.json()) as SwitchBotStatus;
  } catch {
    console.error("Invalid SwitchBot environment data: response");
    return false;
  }
  if (status.statusCode !== 100) {
    const message = typeof status.message === "string" ? ` message=${JSON.stringify(status.message)}` : "";
    console.error(`SwitchBot API returned error: statusCode=${String(status.statusCode)}${message}`);
    return false;
  }

  const invalidFields = invalidReadingFields(status);
  if (invalidFields.length > 0) {
    console.error(`Invalid SwitchBot environment data: ${invalidFields.join(", ")}`);
    return false;
  }
  const reading = readingFromStatus(status);
  if (!reading) return false;

  const createdAt = new Date().toISOString();
  await db(env.DB).insert(environmentMetrics).values({ ...reading, createdAt }).run();
  return true;
}

export async function latestEnvironmentMetrics(env: Env): Promise<EnvironmentSnapshot | null> {
  return ((await db(env.DB).select({ temperature: environmentMetrics.temperature, humidity: environmentMetrics.humidity, co2: environmentMetrics.co2, created_at: environmentMetrics.createdAt }).from(environmentMetrics).orderBy(desc(environmentMetrics.createdAt), desc(environmentMetrics.id)).limit(1).get()) as EnvironmentSnapshot | undefined) ?? null;
}

export async function listEnvironmentMetrics(query: HistoryQuery, c: AppContext): Promise<Response> {
  return c.json({ environmentMetrics: await environmentHistory(query, c.env) });
}

export async function environmentHistory(query: HistoryQuery, env: Env): Promise<EnvironmentSnapshot[]> {
  const conditions = [query.from ? sql`datetime(${environmentMetrics.createdAt}) >= datetime(${query.from}, '-9 hours')` : undefined, query.to ? sql`datetime(${environmentMetrics.createdAt}) < datetime(${query.to}, '+1 day', '-9 hours')` : undefined];
  return (await db(env.DB).select({ temperature: environmentMetrics.temperature, humidity: environmentMetrics.humidity, co2: environmentMetrics.co2, created_at: environmentMetrics.createdAt }).from(environmentMetrics).where(and(...conditions)).orderBy(desc(environmentMetrics.createdAt), desc(environmentMetrics.id)).limit(query.limit).all()) as EnvironmentSnapshot[];
}
