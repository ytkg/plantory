const OPEN_METEO_URL = new URL("https://api.open-meteo.com/v1/forecast");

const NISHI_TOKYO = {
  latitude: "35.7253",
  longitude: "139.5380",
} as const;

export type WeatherConditions = {
  temperature: number;
  humidity: number;
  precipitation: number;
  weather_code: number;
  observed_at: string;
};

type OpenMeteoResponse = {
  current?: {
    time?: unknown;
    temperature_2m?: unknown;
    relative_humidity_2m?: unknown;
    precipitation?: unknown;
    weather_code?: unknown;
  };
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function conditionsFromResponse(response: OpenMeteoResponse): WeatherConditions | null {
  const current = response.current;
  if (!current || typeof current.time !== "string") return null;

  const values = [
    current.temperature_2m,
    current.relative_humidity_2m,
    current.precipitation,
    current.weather_code,
  ];
  if (!values.every(isFiniteNumber)) return null;

  return {
    temperature: current.temperature_2m as number,
    humidity: current.relative_humidity_2m as number,
    precipitation: current.precipitation as number,
    weather_code: current.weather_code as number,
    observed_at: current.time,
  };
}

export async function fetchCurrentWeather(): Promise<WeatherConditions | null> {
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", NISHI_TOKYO.latitude);
  url.searchParams.set("longitude", NISHI_TOKYO.longitude);
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,precipitation,weather_code");
  url.searchParams.set("timezone", "Asia/Tokyo");

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error("Open-Meteo API request failed", error);
    return null;
  }
  if (!response.ok) {
    console.error(`Open-Meteo API request failed: status=${response.status}`);
    return null;
  }

  let body: OpenMeteoResponse;
  try {
    body = await response.json() as OpenMeteoResponse;
  } catch {
    console.error("Invalid Open-Meteo weather data: response");
    return null;
  }

  const conditions = conditionsFromResponse(body);
  if (!conditions) console.error("Invalid Open-Meteo weather data: current");
  return conditions;
}
