import { Hono } from "hono";
import { latestEnvironmentMetrics } from "../services/environment";
import { notAllowed } from "./context";

export const environmentRoutes = new Hono<{ Bindings: Env }>();

environmentRoutes.get("/", async (c) => c.json({ environment: await latestEnvironmentMetrics(c.env) }));
environmentRoutes.all("/", (c) => notAllowed(c, "GET"));
