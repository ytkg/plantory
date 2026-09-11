import { Hono } from "hono";
import { listStatus } from "../services/status";
import { notAllowed } from "./context";

export const statusRoutes = new Hono<{ Bindings: Env }>();

statusRoutes.get("/", (c) => listStatus(c));
statusRoutes.all("/", (c) => notAllowed(c, "GET"));
