import { Hono } from "hono";
import { apiKeyRoutes } from "./routes/api-keys";
import { authRoutes } from "./routes/auth";
import { environmentRoutes } from "./routes/environment";
import { pageRoutes } from "./routes/pages";
import { plantRoutes } from "./routes/plants";
import { reportRoutes } from "./routes/reports";
import { statusRoutes } from "./routes/status";
import { collectEnvironmentMetrics } from "./services/environment";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", authRoutes);
app.route("/api/plants", plantRoutes);
app.route("/api/status", statusRoutes);
app.route("/api/environment", environmentRoutes);
app.route("/api/reports", reportRoutes);
app.route("/api/api-keys", apiKeyRoutes);
app.route("/", pageRoutes);

app.notFound((c) => c.json({ error: "Not found." }, 404));
app.onError((cause) => {
  console.error("Plantory request failed", cause);
  return new Response(JSON.stringify({ error: "Internal server error." }), { status: 500, headers: { "Content-Type": "application/json" } });
});

export default {
  fetch: app.fetch,
  async scheduled(_controller, env): Promise<void> {
    try {
      await collectEnvironmentMetrics(env);
    } catch (error) {
      console.error("Plantory environment collection failed", error);
    }
  },
} satisfies ExportedHandler<Env>;
