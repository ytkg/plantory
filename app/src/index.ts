import { createMcpHandler } from "agents/mcp/server";
import { Hono } from "hono";
import { ApiKeyConfigurationError, authenticate, unauthorized } from "./auth";
import { createPlantoryMcpServer } from "./mcp";
import { apiKeyRoutes } from "./routes/api-keys";
import { authRoutes } from "./routes/auth";
import { environmentRoutes } from "./routes/environment";
import { pageRoutes } from "./routes/pages";
import { plantRoutes } from "./routes/plants";
import { reportRoutes } from "./routes/reports";
import { statusRoutes } from "./routes/status";
import { settingsRoutes } from "./routes/settings";
import { weatherRoutes } from "./routes/weather";
import { withCookies } from "./routes/context";
import { collectEnvironmentMetrics } from "./services/environment";
import { withSecurityHeaders } from "./security";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", authRoutes);
app.route("/api/plants", plantRoutes);
app.route("/api/status", statusRoutes);
app.route("/api/environment", environmentRoutes);
app.route("/api/weather", weatherRoutes);
app.route("/api/reports", reportRoutes);
app.route("/api/api-keys", apiKeyRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/", pageRoutes);

app.notFound((c) => c.json({ error: "Not found." }, 404));
app.onError((cause) => {
  if (cause instanceof ApiKeyConfigurationError) {
    console.error("Plantory API key configuration error: API_KEY_PEPPER is not configured.");
    return Response.json({ error: "API key configuration error." }, { status: 500 });
  }
  console.error("Plantory request failed", cause);
  return new Response(JSON.stringify({ error: "Internal server error." }), { status: 500, headers: { "Content-Type": "application/json" } });
});

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (new URL(request.url).pathname === "/mcp") {
      const authentication = await authenticate(request, env, "read", ctx);
      if (!authentication) return withSecurityHeaders(unauthorized());
      const canWrite = authentication.kind === "session" || authentication.scope === "write";
      const response = await createMcpHandler(() => createPlantoryMcpServer(env, canWrite))(request, env, ctx);
      return withSecurityHeaders(authentication.kind === "session" ? withCookies(response, authentication.cookies) : response);
    }
    return withSecurityHeaders(await app.fetch(request, env, ctx));
  },
  async scheduled(_controller, env): Promise<void> {
    try {
      await collectEnvironmentMetrics(env);
    } catch (error) {
      console.error("Plantory environment collection failed", error);
    }
  },
} satisfies ExportedHandler<Env>;
