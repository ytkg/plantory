import { Hono } from "hono";
import { apiKeyRoutes } from "./routes/api-keys";
import { authRoutes } from "./routes/auth";
import { pageRoutes } from "./routes/pages";
import { plantRoutes } from "./routes/plants";
import { reportRoutes } from "./routes/reports";
import { listStatus } from "./services/status";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", authRoutes);
app.route("/api/plants", plantRoutes);
app.get("/api/status", (c) => listStatus(c.env));
app.all("/api/status", () => new Response(null, { status: 405, headers: { Allow: "GET" } }));
app.route("/api/reports", reportRoutes);
app.route("/api/api-keys", apiKeyRoutes);
app.route("/", pageRoutes);

app.notFound((c) => c.json({ error: "Not found." }, 404));
app.onError((cause) => {
  console.error("Plantory request failed", cause);
  return new Response(JSON.stringify({ error: "Internal server error." }), { status: 500, headers: { "Content-Type": "application/json" } });
});

export default app;
