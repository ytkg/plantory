import { Hono } from "hono";
import { createManagedApiKey, deleteRevokedApiKey, listApiKeys, revokeApiKey } from "../services/api-keys";
import { notAllowed, sessionOnly } from "./context";

export const apiKeyRoutes = new Hono<{ Bindings: Env }>();
apiKeyRoutes.get("/", (c) => sessionOnly(c, () => listApiKeys(c)));
apiKeyRoutes.post("/", (c) => sessionOnly(c, () => createManagedApiKey(c)));
apiKeyRoutes.all("/", (c) => notAllowed(c, "GET, POST"));
apiKeyRoutes.post("/:id/revoke", (c) => sessionOnly(c, () => revokeApiKey(Number(c.req.param("id")), c)));
apiKeyRoutes.delete("/:id", (c) => sessionOnly(c, () => deleteRevokedApiKey(Number(c.req.param("id")), c)));
