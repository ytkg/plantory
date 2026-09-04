import {
  createManagedApiKey,
  deleteRevokedApiKey,
  listApiKeys,
  revokeApiKey,
} from "./api-keys";
import { authenticate, authenticateSession, login, logout, unauthorized } from "./auth";
import { error, methodNotAllowed, resourceId } from "./http";
import { loginDestination, protectedAsset, redirectToLogin, withCookies } from "./pages";
import { createMetric, createPlant, listMetrics, listPlants } from "./plants";
import { listReports, upsertReport } from "./reports";
import { listStatus } from "./status";

const protectedPages = new Map([
  ["/plants", "/plants.html"],
  ["/settings/api-keys", "/api-keys.html"],
]);

const staticAssets = new Set([
  "/styles.css",
  "/chart.umd.min.js",
  "/api-client.js",
  "/ui.js",
  "/reports.js",
  "/login.js",
  "/plants.js",
  "/api-keys.js",
  "/authenticated-header.js",
]);

async function authenticatedApiResponse(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  requiredScope: "read" | "write",
  handler: () => Promise<Response>,
): Promise<Response> {
  const authentication = await authenticate(request, env, requiredScope, ctx);
  if (!authentication) return unauthorized();
  const response = await handler();
  return authentication.kind === "session" ? withCookies(response, authentication.cookies) : response;
}

async function sessionApiResponse(
  request: Request,
  env: Env,
  handler: () => Promise<Response>,
): Promise<Response> {
  const session = await authenticateSession(request, env);
  if (!session) return unauthorized();
  return withCookies(await handler(), session.cookies);
}

async function handlePlantsApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "GET") return authenticatedApiResponse(request, env, ctx, "read", () => listPlants(env));
  if (request.method === "POST") return authenticatedApiResponse(request, env, ctx, "write", () => createPlant(request, env));
  return methodNotAllowed("GET, POST");
}

async function handleMetricsApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  plantId: number,
): Promise<Response> {
  if (request.method === "GET") return authenticatedApiResponse(request, env, ctx, "read", () => listMetrics(plantId, env));
  if (request.method === "POST") return authenticatedApiResponse(request, env, ctx, "write", () => createMetric(plantId, request, env));
  return methodNotAllowed("GET, POST");
}

async function handleApiKeysApi(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") return sessionApiResponse(request, env, () => listApiKeys(env));
  if (request.method === "POST") return sessionApiResponse(request, env, () => createManagedApiKey(request, env));
  return methodNotAllowed("GET, POST");
}

async function handleReportsApi(request: Request, env: Env, ctx: ExecutionContext, date?: string): Promise<Response> {
  if (!date && request.method === "GET") return listReports(env);
  if (date && request.method === "PUT") {
    return authenticatedApiResponse(request, env, ctx, "write", () => upsertReport(date, request, env));
  }
  return methodNotAllowed(date ? "PUT" : "GET");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    try {
      if (pathname === "/api/auth/login" && request.method === "POST") return login(request, env);
      if (pathname === "/api/auth/logout" && request.method === "POST") return logout(request);

      const protectedPage = protectedPages.get(pathname);
      if (protectedPage) {
        const session = await authenticateSession(request, env);
        return session
          ? withCookies(await protectedAsset(protectedPage, request, env), session.cookies)
          : redirectToLogin(request);
      }

      if (pathname === "/") {
        const session = await authenticateSession(request, env);
        const asset = session ? "/index-authenticated.html" : "/index.html";
        return withCookies(await protectedAsset(asset, request, env), session?.cookies ?? []);
      }

      if (pathname === "/api/plants") return handlePlantsApi(request, env, ctx);

      if (pathname === "/api/status") {
        if (request.method !== "GET") return methodNotAllowed("GET");
        return listStatus(env);
      }

      const metricsMatch = pathname.match(/^\/api\/plants\/(\d+)\/metrics$/);
      if (metricsMatch) {
        const plantId = resourceId(metricsMatch[1]);
        return plantId ? handleMetricsApi(request, env, ctx, plantId) : error("Plant not found.", 404);
      }

      if (pathname === "/api/api-keys") return handleApiKeysApi(request, env);

      if (pathname === "/api/reports") return handleReportsApi(request, env, ctx);

      const reportMatch = pathname.match(/^\/api\/reports\/(\d{4}-\d{2}-\d{2})$/);
      if (reportMatch) return handleReportsApi(request, env, ctx, reportMatch[1]);

      const revokeMatch = pathname.match(/^\/api\/api-keys\/(\d+)\/revoke$/);
      if (revokeMatch && request.method === "POST") {
        const apiKeyId = resourceId(revokeMatch[1]);
        return apiKeyId
          ? sessionApiResponse(request, env, () => revokeApiKey(apiKeyId, env))
          : error("API key not found.", 404);
      }

      const apiKeyMatch = pathname.match(/^\/api\/api-keys\/(\d+)$/);
      if (apiKeyMatch && request.method === "DELETE") {
        const apiKeyId = resourceId(apiKeyMatch[1]);
        return apiKeyId
          ? sessionApiResponse(request, env, () => deleteRevokedApiKey(apiKeyId, env))
          : error("API key not found.", 404);
      }

      if (pathname === "/login") {
        const session = await authenticateSession(request, env);
        return session
          ? withCookies(Response.redirect(new URL(loginDestination(request), request.url).toString(), 302), session.cookies)
          : protectedAsset("/login.html", request, env);
      }

      if (staticAssets.has(pathname)) return protectedAsset(pathname, request, env);
      return error("Not found.", 404);
    } catch (cause) {
      console.error("Plantory request failed", cause);
      return error("Internal server error.", 500);
    }
  },
} satisfies ExportedHandler<Env>;
