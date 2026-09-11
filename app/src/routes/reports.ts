import { Hono } from "hono";
import { listReports, upsertReport } from "../services/reports";
import { authenticated, notAllowed } from "./context";

export const reportRoutes = new Hono<{ Bindings: Env }>();
reportRoutes.get("/", (c) => listReports(c));
reportRoutes.all("/", (c) => notAllowed(c, "GET"));
reportRoutes.put("/:date", (c) => authenticated(c, "write", () => upsertReport(c)));
reportRoutes.all("/:date", (c) => notAllowed(c, "PUT"));
