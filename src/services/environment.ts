const SWITCHBOT_STATUS_URL = "https://api.switch-bot.com/v1.1/devices";

type EnvironmentReading = {
  temperature: number;
  humidity: number;
  co2: number;
};

type EnvironmentSnapshot = EnvironmentReading & {
  created_at: string;
};

type SwitchBotStatus = {
  statusCode?: unknown;
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

function readingFromStatus(status: SwitchBotStatus): EnvironmentReading | null {
  if (status.statusCode !== 100 || !status.body) return null;

  const { temperature, humidity, CO2: co2 } = status.body;
  const values = [temperature, humidity, co2];

  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;

  return {
    temperature: temperature as number,
    humidity: humidity as number,
    co2: co2 as number,
  };
}

export async function collectEnvironmentMetrics(env: Env): Promise<boolean> {
  const response = await fetch(`${SWITCHBOT_STATUS_URL}/${encodeURIComponent(env.SWITCHBOT_DEVICE_ID)}/status`, {
    headers: await createSwitchBotHeaders(env),
  });
  if (!response.ok) return false;

  const reading = readingFromStatus((await response.json()) as SwitchBotStatus);
  if (!reading) return false;

  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO environment_metrics (temperature, humidity, co2, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(reading.temperature, reading.humidity, reading.co2, createdAt)
    .run();
  return true;
}

export async function latestEnvironmentMetrics(env: Env): Promise<EnvironmentSnapshot | null> {
  return env.DB.prepare(
    `SELECT temperature, humidity, co2, created_at
     FROM environment_metrics
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
  ).first<EnvironmentSnapshot>();
}
