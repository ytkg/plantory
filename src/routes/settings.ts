import { Hono } from "hono";
import { getMetricsSettings, updateMetricsSettings } from "../services/metrics-settings";
import { authenticated, notAllowed, sessionOnly } from "./context";

export const settingsRoutes = new Hono<{ Bindings: Env }>();
settingsRoutes.use("/metrics", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});
settingsRoutes.get("/metrics", (c) => authenticated(c, "read", () => getMetricsSettings(c)));
settingsRoutes.put("/metrics", (c) => sessionOnly(c, () => updateMetricsSettings(c)));
settingsRoutes.all("/metrics", (c) => notAllowed(c, "GET, PUT"));
