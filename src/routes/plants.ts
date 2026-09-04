import { Hono } from "hono";
import { methodNotAllowed, error } from "../http";
import { createMetric, createPlant, deleteMetrics, listMetrics, listPlants } from "../plants";
import { authenticated, type AppContext } from "./context";

export const plantRoutes = new Hono<{ Bindings: Env }>();
plantRoutes.on(["GET", "POST"], "/", async (c) => authenticated(c, c.req.method === "GET" ? "read" : "write", () => c.req.method === "GET" ? listPlants(c.env) : createPlant(c.req.raw, c.env)));
plantRoutes.all("/", (c) => methodNotAllowed("GET, POST"));

plantRoutes.get("/:id/metrics", async (c) => {
  const id = Number(c.req.param("id"));
  return Number.isSafeInteger(id) && id > 0 ? authenticated(c, "read", () => listMetrics(id, c.env)) : error("Plant not found.", 404);
});
plantRoutes.post("/:id/metrics", async (c) => {
  const id = Number(c.req.param("id"));
  return Number.isSafeInteger(id) && id > 0 ? authenticated(c, "write", () => createMetric(id, c.req.raw, c.env)) : error("Plant not found.", 404);
});
plantRoutes.delete("/:id/metrics", async (c) => {
  const id = Number(c.req.param("id"));
  return Number.isSafeInteger(id) && id > 0 ? authenticated(c, "write", () => deleteMetrics(id, c.env)) : error("Plant not found.", 404);
});
plantRoutes.all("/:id/metrics", (c) => methodNotAllowed("GET, POST, DELETE"));
