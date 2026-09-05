import { Hono } from "hono";
import { authenticateSession } from "../auth";
import { loginDestination, protectedAsset, redirectToLogin } from "../pages";
import { setCookies } from "./context";
import type { AppContext } from "./context";

export const pageRoutes = new Hono<{ Bindings: Env }>();
const protectedPages = new Map([["/plants", "/plants.html"], ["/settings/api-keys", "/api-keys.html"]]);
const staticAssets = new Set(["/styles.css", "/chart.umd.min.js", "/api-client.js", "/ui.js", "/reports.js", "/status.js", "/login.js", "/plants.js", "/api-keys.js", "/authenticated-header.js"]);

for (const [path, asset] of protectedPages) pageRoutes.get(path, async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  if (!session) return redirectToLogin(c.req.raw);
  setCookies(c, session.cookies);
  return protectedAsset(asset, c.req.raw, c.env);
});
pageRoutes.get("/", async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  setCookies(c, session?.cookies ?? []);
  return protectedAsset(session ? "/index-authenticated.html" : "/index.html", c.req.raw, c.env);
});
pageRoutes.get("/login", async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  if (!session) return protectedAsset("/login.html", c.req.raw, c.env);
  setCookies(c, session.cookies);
  return Response.redirect(new URL(loginDestination(c.req.raw), c.req.url).toString(), 302);
});
for (const asset of staticAssets) pageRoutes.get(asset, (c) => protectedAsset(asset, c.req.raw, c.env));
