import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentWeather } from "../src/services/weather";

describe("Open-Meteo weather service", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the current weather for Nishi-Tokyo", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({
      current: {
        time: "2026-09-07T10:00",
        temperature_2m: 24.3,
        relative_humidity_2m: 61,
        precipitation: 0.4,
        weather_code: 3,
      },
    })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCurrentWeather()).resolves.toEqual({
      temperature: 24.3,
      humidity: 61,
      precipitation: 0.4,
      weather_code: 3,
      observed_at: "2026-09-07T10:00",
    });

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(requestUrl.origin + requestUrl.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(requestUrl.searchParams.get("latitude")).toBe("35.7253");
    expect(requestUrl.searchParams.get("longitude")).toBe("139.5380");
    expect(requestUrl.searchParams.get("current")).toBe("temperature_2m,relative_humidity_2m,precipitation,weather_code");
    expect(requestUrl.searchParams.get("timezone")).toBe("Asia/Tokyo");
  });

  it("returns null for an unsuccessful response or invalid weather data", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 503 })));
    await expect(fetchCurrentWeather()).resolves.toBeNull();

    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({
      current: { time: "2026-09-07T10:00", temperature_2m: 24.3 },
    })));
    await expect(fetchCurrentWeather()).resolves.toBeNull();
  });
});
