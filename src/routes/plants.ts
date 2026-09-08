import { Hono } from "hono";
import { createMetric, createPlant, deleteMetric, deleteMetrics, listMetrics, listPlants, rawMetricPage } from "../services/plants";
import { authenticated, notAllowed } from "./context";
import { historyQuery, rawMetricQuery, resourceId } from "../validation";

export const plantRoutes = new Hono<{ Bindings: Env }>();
plantRoutes.on(["GET", "POST"], "/", async (c) => authenticated(c, c.req.method === "GET" ? "read" : "write", () => c.req.method === "GET" ? listPlants(c) : createPlant(c)));
plantRoutes.all("/", (c) => notAllowed(c, "GET, POST"));

plantRoutes.get("/:id/metrics", async (c) => {
  const id = resourceId(c.req.param("id"));
  if (!id) return c.json({ error: "Plant not found." }, 404);
  return authenticated(c, "read", () => {
    const query = historyQuery(c.req.query());
    if ("error" in query) return Promise.resolve(c.json({ error: query.error }, 400));
    return listMetrics(id, query.value, c);
  });
});
plantRoutes.get("/:id/metrics/raw", async (c) => {
  const id = resourceId(c.req.param("id"));
  if (!id) return c.json({ error: "Plant not found." }, 404);
  return authenticated(c, "read", () => {
    const query = rawMetricQuery(c.req.query());
    if ("error" in query) return Promise.resolve(c.json({ error: query.error }, 400));
    return rawMetricPage(id, query.value, c.env).then((history) => history ? c.json(history) : c.json({ error: "Plant not found." }, 404));
  });
});
plantRoutes.post("/:id/metrics", async (c) => {
  const id = resourceId(c.req.param("id"));
  return id ? authenticated(c, "write", () => createMetric(id, c)) : c.json({ error: "Plant not found." }, 404);
});
plantRoutes.delete("/:id/metrics", async (c) => {
  const id = resourceId(c.req.param("id"));
  return id ? authenticated(c, "write", () => deleteMetrics(id, c)) : c.json({ error: "Plant not found." }, 404);
});
plantRoutes.delete("/:id/metrics/:metricId", async (c) => {
  const plantId = resourceId(c.req.param("id"));
  const metricId = resourceId(c.req.param("metricId"));
  return plantId && metricId ? authenticated(c, "write", () => deleteMetric(plantId, metricId, c)) : c.json({ error: "Metric not found." }, 404);
});
plantRoutes.all("/:id/metrics/:metricId", (c) => notAllowed(c, "DELETE"));
plantRoutes.all("/:id/metrics/raw", (c) => notAllowed(c, "GET"));
plantRoutes.all("/:id/metrics", (c) => notAllowed(c, "GET, POST, DELETE"));
