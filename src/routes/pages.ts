import { Hono } from "hono";
import { authenticateSession } from "../auth";
import { loginDestination, protectedAsset, redirectToLogin, withCookies } from "../pages";
import { error } from "../http";
import type { AppContext } from "./context";

export const pageRoutes = new Hono<{ Bindings: Env }>();
const protectedPages = new Map([["/plants", "/plants.html"], ["/settings/api-keys", "/api-keys.html"]]);
const staticAssets = new Set(["/styles.css", "/chart.umd.min.js", "/api-client.js", "/ui.js", "/reports.js", "/login.js", "/plants.js", "/api-keys.js", "/authenticated-header.js"]);

for (const [path, asset] of protectedPages) pageRoutes.get(path, async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  return session ? withCookies(await protectedAsset(asset, c.req.raw, c.env), session.cookies) : redirectToLogin(c.req.raw);
});
pageRoutes.get("/", async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  return withCookies(await protectedAsset(session ? "/index-authenticated.html" : "/index.html", c.req.raw, c.env), session?.cookies ?? []);
});
pageRoutes.get("/login", async (c) => {
  const session = await authenticateSession(c.req.raw, c.env);
  return session ? withCookies(Response.redirect(new URL(loginDestination(c.req.raw), c.req.url).toString(), 302), session.cookies) : protectedAsset("/login.html", c.req.raw, c.env);
});
for (const asset of staticAssets) pageRoutes.get(asset, (c) => protectedAsset(asset, c.req.raw, c.env));
