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
