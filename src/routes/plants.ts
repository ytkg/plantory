import { Hono } from "hono";
import { createMetric, createPlant, deleteMetrics, listMetrics, listPlants } from "../services/plants";
import { authenticated, notAllowed } from "./context";
import { resourceId } from "../validation";

export const plantRoutes = new Hono<{ Bindings: Env }>();
plantRoutes.on(["GET", "POST"], "/", async (c) => authenticated(c, c.req.method === "GET" ? "read" : "write", () => c.req.method === "GET" ? listPlants(c) : createPlant(c)));
plantRoutes.all("/", (c) => notAllowed(c, "GET, POST"));

plantRoutes.get("/:id/metrics", async (c) => {
  const id = resourceId(c.req.param("id"));
  return id ? authenticated(c, "read", () => listMetrics(id, c)) : c.json({ error: "Plant not found." }, 404);
});
plantRoutes.post("/:id/metrics", async (c) => {
  const id = resourceId(c.req.param("id"));
  return id ? authenticated(c, "write", () => createMetric(id, c)) : c.json({ error: "Plant not found." }, 404);
});
plantRoutes.delete("/:id/metrics", async (c) => {
  const id = resourceId(c.req.param("id"));
  return id ? authenticated(c, "write", () => deleteMetrics(id, c)) : c.json({ error: "Plant not found." }, 404);
});
plantRoutes.all("/:id/metrics", (c) => notAllowed(c, "GET, POST, DELETE"));
