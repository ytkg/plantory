import { Hono } from "hono";
import { methodNotAllowed } from "../http";
import { listReports, upsertReport } from "../services/reports";
import { authenticated, type AppContext } from "./context";

export const reportRoutes = new Hono<{ Bindings: Env }>();
reportRoutes.get("/", (c) => listReports(c.env));
reportRoutes.all("/", (c) => methodNotAllowed("GET"));
reportRoutes.put("/:date", (c) => authenticated(c, "write", () => upsertReport(c.req.param("date"), c.req.raw, c.env)));
reportRoutes.all("/:date", (c) => methodNotAllowed("PUT"));
