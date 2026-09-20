import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDailyWeather } from "../src/services/weather";

describe("Open-Meteo weather service", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns daily historical weather for Nishi-Tokyo", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({
      daily: {
        time: ["2026-09-07"],
        weather_code: [3],
        temperature_2m_max: [24.3],
        temperature_2m_min: [18.1],
        relative_humidity_2m_mean: [61],
        precipitation_sum: [0.4],
        sunshine_duration: [21600],
      },
    })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDailyWeather("2026-09-07", "2026-09-07")).resolves.toEqual([
      { date: "2026-09-07", weather_code: 3, temperature_max: 24.3, temperature_min: 18.1, humidity: 61, precipitation: 0.4, sunshine_duration: 21600 },
    ]);

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(requestUrl.origin + requestUrl.pathname).toBe("https://archive-api.open-meteo.com/v1/archive");
    expect(requestUrl.searchParams.get("latitude")).toBe("35.7253");
    expect(requestUrl.searchParams.get("longitude")).toBe("139.5380");
    expect(requestUrl.searchParams.get("start_date")).toBe("2026-09-07");
    expect(requestUrl.searchParams.get("end_date")).toBe("2026-09-07");
    expect(requestUrl.searchParams.get("daily")).toBe("weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum,sunshine_duration");
    expect(requestUrl.searchParams.get("timezone")).toBe("Asia/Tokyo");
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
