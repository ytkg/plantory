import { Hono } from "hono";
import { methodNotAllowed } from "../http";
import { createManagedApiKey, deleteRevokedApiKey, listApiKeys, revokeApiKey } from "../api-keys";
import { sessionOnly } from "./context";

export const apiKeyRoutes = new Hono<{ Bindings: Env }>();
apiKeyRoutes.get("/", (c) => sessionOnly(c, () => listApiKeys(c.env)));
apiKeyRoutes.post("/", (c) => sessionOnly(c, () => createManagedApiKey(c.req.raw, c.env)));
apiKeyRoutes.all("/", (c) => methodNotAllowed("GET, POST"));
apiKeyRoutes.post("/:id/revoke", (c) => sessionOnly(c, () => revokeApiKey(Number(c.req.param("id")), c.env)));
apiKeyRoutes.delete("/:id", (c) => sessionOnly(c, () => deleteRevokedApiKey(Number(c.req.param("id")), c.env)));
