import { Hono } from "hono";
import { latestEnvironmentMetrics, listEnvironmentMetrics } from "../services/environment";
import { authenticated, notAllowed } from "./context";
import { historyQuery } from "../validation";

export const environmentRoutes = new Hono<{ Bindings: Env }>();

environmentRoutes.get("/", async (c) => c.json({ environment: await latestEnvironmentMetrics(c.env) }));
environmentRoutes.all("/", (c) => notAllowed(c, "GET"));

environmentRoutes.get("/metrics", async (c) => {
  return authenticated(c, "read", () => {
    const query = historyQuery(c.req.query());
    if ("error" in query) return Promise.resolve(c.json({ error: query.error }, 400));
    return listEnvironmentMetrics(query.value, c);
  });
});
environmentRoutes.all("/metrics", (c) => notAllowed(c, "GET"));
