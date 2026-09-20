import { Hono } from "hono";
import { createManagedApiKey, deleteRevokedApiKey, listApiKeys, revokeApiKey } from "../services/api-keys";
import { notAllowed, sessionOnly } from "./context";
import { resourceId } from "../validation";

export const apiKeyRoutes = new Hono<{ Bindings: Env }>();
apiKeyRoutes.get("/", (c) => sessionOnly(c, () => listApiKeys(c)));
apiKeyRoutes.post("/", (c) => sessionOnly(c, () => createManagedApiKey(c)));
apiKeyRoutes.all("/", (c) => notAllowed(c, "GET, POST"));
apiKeyRoutes.post("/:id/revoke", (c) => sessionOnly(c, async () => {
  const id = resourceId(c.req.param("id"));
  return id ? revokeApiKey(id, c) : c.json({ error: "API key not found or already revoked." }, 404);
}));
apiKeyRoutes.delete("/:id", (c) => sessionOnly(c, async () => {
  const id = resourceId(c.req.param("id"));
  return id ? deleteRevokedApiKey(id, c) : c.json({ error: "Revoked API key not found." }, 404);
}));
