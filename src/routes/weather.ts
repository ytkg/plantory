import { Hono } from "hono";
import { fetchDailyWeather } from "../services/weather";
import { authenticated, notAllowed } from "./context";
import { historyQuery } from "../validation";

export const weatherRoutes = new Hono<{ Bindings: Env }>();

weatherRoutes.get("/", async (c) => {
  return authenticated(c, "read", async () => {
    const query = historyQuery(c.req.query());
    if ("error" in query) return c.json({ error: query.error }, 400);
    if (!query.value.from || !query.value.to) return c.json({ error: "from and to are required." }, 400);
    const weather = await fetchDailyWeather(query.value.from!, query.value.to!);
    return weather ? c.json({ weather }) : c.json({ error: "Could not fetch weather data." }, 502);
  });
});
weatherRoutes.all("/", (c) => notAllowed(c, "GET"));
