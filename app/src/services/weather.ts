const OPEN_METEO_URL = new URL("https://api.open-meteo.com/v1/forecast");
const OPEN_METEO_ARCHIVE_URL = new URL("https://archive-api.open-meteo.com/v1/archive");

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

export type DailyWeather = {
  date: string;
  weather_code: number;
  temperature_max: number;
  temperature_min: number;
  humidity: number;
  precipitation: number;
  sunshine_duration: number;
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

type OpenMeteoDailyResponse = {
  daily?: {
    time?: unknown;
    weather_code?: unknown;
    temperature_2m_max?: unknown;
    temperature_2m_min?: unknown;
    relative_humidity_2m_mean?: unknown;
    precipitation_sum?: unknown;
    sunshine_duration?: unknown;
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

function dailyWeatherFromResponse(response: OpenMeteoDailyResponse): DailyWeather[] | null {
  const daily = response.daily;
  if (!daily) return null;
  const time = daily.time;
  const series = [
    daily.weather_code,
    daily.temperature_2m_max,
    daily.temperature_2m_min,
    daily.relative_humidity_2m_mean,
    daily.precipitation_sum,
    daily.sunshine_duration,
  ];
  if (!Array.isArray(time) || !series.every(Array.isArray)) return null;
  if (!time.every((date): date is string => typeof date === "string")) return null;
  if (!series.every((values) => values.length === time.length && values.every(isFiniteNumber))) return null;

  const [weatherCodes, temperaturesMax, temperaturesMin, humidity, precipitation, sunshineDuration] = series as number[][];
  return time.map((date, index) => ({
    date,
    weather_code: weatherCodes[index],
    temperature_max: temperaturesMax[index],
    temperature_min: temperaturesMin[index],
    humidity: humidity[index],
    precipitation: precipitation[index],
    sunshine_duration: sunshineDuration[index],
  }));
}

export async function fetchDailyWeather(from: string, to: string): Promise<DailyWeather[] | null> {
  const url = new URL(OPEN_METEO_ARCHIVE_URL);
  url.searchParams.set("latitude", NISHI_TOKYO.latitude);
  url.searchParams.set("longitude", NISHI_TOKYO.longitude);
  url.searchParams.set("start_date", from);
  url.searchParams.set("end_date", to);
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum,sunshine_duration");
  url.searchParams.set("timezone", "Asia/Tokyo");

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error("Open-Meteo historical weather API request failed", error);
    return null;
  }
  if (!response.ok) {
    console.error(`Open-Meteo historical weather API request failed: status=${response.status}`);
    return null;
  }

  let body: OpenMeteoDailyResponse;
  try {
    body = await response.json() as OpenMeteoDailyResponse;
  } catch {
    console.error("Invalid Open-Meteo historical weather data: response");
    return null;
  }

  const weather = dailyWeatherFromResponse(body);
  if (!weather) console.error("Invalid Open-Meteo historical weather data: daily");
  return weather;
}
