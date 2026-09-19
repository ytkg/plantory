import { Hono } from "hono";
import { authenticateSession } from "../auth";
import { loginDestination, protectedAsset, redirectToLogin } from "../pages";
import { withCookies } from "./context";

export const pageRoutes = new Hono<{ Bindings: Env }>();
const protectedPages = new Map([["/plants", "/plants.html"], ["/settings/api-keys", "/api-keys.html"], ["/settings/metrics", "/metrics-settings.html"]]);
const staticAssets = new Set(["/styles.css", "/chart.umd.min.js", "/marked.umd.js", "/purify.min.js", "/api-client.js", "/presentation.js", "/ui.js", "/reports.js", "/status.js", "/environment.js", "/login.js", "/plants.js", "/metrics.js", "/metrics-query.js", "/api-keys.js", "/metrics-settings.js", "/authenticated-header.js"]);

for (const [path, asset] of protectedPages) pageRoutes.get(path, async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  if (!session) return redirectToLogin(c.req.raw);
  return withCookies(await protectedAsset(asset, c.req.raw, c.env), session.cookies);
});
pageRoutes.get("/plants/:id/metrics", async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  if (!session) return redirectToLogin(c.req.raw);
  return withCookies(await protectedAsset("/metrics.html", c.req.raw, c.env), session.cookies);
});
pageRoutes.get("/", async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  return withCookies(await protectedAsset(session ? "/index-authenticated.html" : "/index.html", c.req.raw, c.env), session?.cookies ?? []);
});
pageRoutes.get("/login", async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  if (!session) return protectedAsset("/login.html", c.req.raw, c.env);
  return withCookies(Response.redirect(new URL(loginDestination(c.req.raw), c.req.url).toString(), 302), session.cookies);
});
for (const asset of staticAssets) pageRoutes.get(asset, (c) => protectedAsset(asset, c.req.raw, c.env));
