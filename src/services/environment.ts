const SWITCHBOT_STATUS_URL = "https://api.switch-bot.com/v1.1/devices";

type EnvironmentMetricType = "temperature" | "humidity" | "co2";

type EnvironmentReading = {
  metricType: EnvironmentMetricType;
  value: number;
};

type EnvironmentSnapshot = Record<EnvironmentMetricType, number> & {
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

export async function latestEnvironmentMetrics(env: Env): Promise<EnvironmentSnapshot | null> {
  const { results } = await env.DB.prepare(
    `SELECT metric_type, value, created_at
     FROM (
       SELECT metric_type, value, created_at, id,
              ROW_NUMBER() OVER (PARTITION BY metric_type ORDER BY created_at DESC, id DESC) AS rank
       FROM environment_metrics
     )
     WHERE rank = 1`,
  ).all<{ metric_type: EnvironmentMetricType; value: number; created_at: string }>();

  const readings = new Map(results.map((row) => [row.metric_type, row]));
  const temperature = readings.get("temperature");
  const humidity = readings.get("humidity");
  const co2 = readings.get("co2");
  if (!temperature || !humidity || !co2) return null;

  const createdAt = [temperature, humidity, co2]
    .map((reading) => reading.created_at)
    .sort()
    .at(-1)!;
  return {
    temperature: temperature.value,
    humidity: humidity.value,
    co2: co2.value,
    created_at: createdAt,
  };
}
