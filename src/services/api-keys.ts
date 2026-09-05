import { createApiKeyValue, hashApiKey } from "../auth";
import type { ApiKey } from "../types";
import type { AppContext } from "../routes/context";

type CreateApiKeyInput = { name?: unknown; scope?: unknown };

export async function listApiKeys(c: AppContext): Promise<Response> {
  const result = await c.env.DB.prepare(
    `SELECT id, name, scope, created_at, last_used_at, revoked_at
     FROM api_keys ORDER BY id DESC`,
  ).all<ApiKey>();
  return c.json({ apiKeys: result.results });
}

export async function createManagedApiKey(c: AppContext): Promise<Response> {
  let input: CreateApiKeyInput;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON." }, 400);
  }
  if (typeof input.name !== "string") return c.json({ error: "name is required." }, 400);

  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) return c.json({ error: "name must contain 1 to 100 characters." }, 400);
  if (input.scope !== "read" && input.scope !== "write") return c.json({ error: "scope must be read or write." }, 400);

  const key = createApiKeyValue();
  const result = await c.env.DB.prepare(
    `INSERT INTO api_keys (name, key_hash, scope)
     VALUES (?, ?, ?)
     RETURNING id, name, scope, created_at, last_used_at, revoked_at`,
  ).bind(name, await hashApiKey(key, c.env), input.scope).all<ApiKey>();
  return result.results[0] ? c.json({ apiKey: result.results[0], key }, 201) : c.json({ error: "Could not create API key." }, 500);
}

export async function revokeApiKey(id: number, c: AppContext): Promise<Response> {
  const result = await c.env.DB.prepare(
    "UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL",
  ).bind(id).run();
  return result.meta.changes === 0 ? c.json({ error: "API key not found or already revoked." }, 404) : c.json({ revoked: true });
}

export async function deleteRevokedApiKey(id: number, c: AppContext): Promise<Response> {
  const result = await c.env.DB.prepare("DELETE FROM api_keys WHERE id = ? AND revoked_at IS NOT NULL").bind(id).run();
  return result.meta.changes === 0 ? c.json({ error: "Revoked API key not found." }, 404) : c.json({ deleted: true });
}
