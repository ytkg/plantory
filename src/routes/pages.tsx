import { Hono } from "hono";
import { renderToString } from "hono/jsx/dom/server";
import type { Child } from "hono/jsx";
import { authenticateSession } from "../auth";
import { ApiKeysPage, LoginPage, MetricsPage, ObservationPage, PlantsPage } from "../components/pages";
import { loginDestination, protectedAsset, redirectToLogin } from "../pages";
import { setCookies } from "./context";

export const pageRoutes = new Hono<{ Bindings: Env }>();
const protectedPages = new Map([["/plants", PlantsPage], ["/settings/api-keys", ApiKeysPage]]);
const staticAssets = new Set(["/styles.css", "/chart.umd.min.js", "/marked.umd.js", "/purify.min.js", "/api-client.js", "/presentation.js", "/ui.js", "/reports.js", "/status.js", "/environment.js", "/login.js", "/plants.js", "/metrics.js", "/api-keys.js", "/authenticated-header.js"]);

function page(element: Child): Response {
  return new Response(`<!doctype html>${renderToString(element)}`, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}

for (const [path, Page] of protectedPages) pageRoutes.get(path, async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  if (!session) return redirectToLogin(c.req.raw);
  setCookies(c, session.cookies);
  return page(<Page />);
});
pageRoutes.get("/plants/:id/metrics", async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  if (!session) return redirectToLogin(c.req.raw);
  setCookies(c, session.cookies);
  return page(<MetricsPage />);
});
pageRoutes.get("/", async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  setCookies(c, session?.cookies ?? []);
  return page(<ObservationPage authenticated={Boolean(session)} />);
});
pageRoutes.get("/login", async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  if (!session) return page(<LoginPage />);
  setCookies(c, session.cookies);
  return Response.redirect(new URL(loginDestination(c.req.raw), c.req.url).toString(), 302);
});
for (const asset of staticAssets) pageRoutes.get(asset, (c) => protectedAsset(asset, c.req.raw, c.env));
