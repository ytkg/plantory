import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentWeather, fetchDailyWeather } from "../src/services/weather";

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

  it.each([
    [{ daily: { time: ["2026-09-01", "2026-09-02"], weather_code: [1], temperature_2m_max: [30, 31], temperature_2m_min: [20, 21], relative_humidity_2m_mean: [60, 61], precipitation_sum: [0, 1], sunshine_duration: [100, 200] } }],
    [{ daily: { time: ["2026-09-01"], weather_code: [1], temperature_2m_max: [30], temperature_2m_min: [20], relative_humidity_2m_mean: [null], precipitation_sum: [0], sunshine_duration: [100] } }],
    [{ daily: { time: ["2026-09-01"], weather_code: [1], temperature_2m_max: [30], temperature_2m_min: [20], relative_humidity_2m_mean: [60], precipitation_sum: [0] } }],
  ])("rejects malformed daily weather series", async (body) => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(body)));
    await expect(fetchDailyWeather("2026-09-01", "2026-09-02")).resolves.toBeNull();
  });

  it("returns null when the daily weather request fails or is not JSON", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 503 })));
    await expect(fetchDailyWeather("2026-09-01", "2026-09-02")).resolves.toBeNull();

    vi.stubGlobal("fetch", () => Promise.resolve(new Response("not json", { headers: { "Content-Type": "application/json" } })));
    await expect(fetchDailyWeather("2026-09-01", "2026-09-02")).resolves.toBeNull();
  });
});
