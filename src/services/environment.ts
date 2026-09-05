const SWITCHBOT_STATUS_URL = "https://api.switch-bot.com/v1.1/devices";

type EnvironmentMetricType = "temperature" | "humidity" | "co2";

type EnvironmentReading = {
  metricType: EnvironmentMetricType;
  value: number;
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

function readingsFromStatus(status: SwitchBotStatus): EnvironmentReading[] | null {
  if (status.statusCode !== 100 || !status.body) return null;

  const values: Array<[EnvironmentMetricType, unknown]> = [
    ["temperature", status.body.temperature],
    ["humidity", status.body.humidity],
    ["co2", status.body.CO2],
  ];

  if (values.some(([, value]) => typeof value !== "number" || !Number.isFinite(value))) return null;

  return values.map(([metricType, value]) => ({ metricType, value: value as number }));
}

export async function collectEnvironmentMetrics(env: Env): Promise<boolean> {
  const response = await fetch(`${SWITCHBOT_STATUS_URL}/${encodeURIComponent(env.SWITCHBOT_DEVICE_ID)}/status`, {
    headers: await createSwitchBotHeaders(env),
  });
  if (!response.ok) return false;

  const readings = readingsFromStatus((await response.json()) as SwitchBotStatus);
  if (!readings) return false;

  const createdAt = new Date().toISOString();
  await env.DB.batch(
    readings.map(({ metricType, value }) =>
      env.DB
        .prepare("INSERT INTO environment_metrics (metric_type, value, created_at) VALUES (?, ?, ?)")
        .bind(metricType, value, createdAt),
    ),
  );
  return true;
}
