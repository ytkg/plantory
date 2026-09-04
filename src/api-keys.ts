import { createApiKeyValue, hashApiKey } from "./auth";
import { error, json } from "./http";
import type { ApiKey } from "./types";

type CreateApiKeyInput = { name?: unknown; scope?: unknown };

export async function listApiKeys(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT id, name, scope, created_at, last_used_at, revoked_at
     FROM api_keys ORDER BY id DESC`,
  ).all<ApiKey>();
  return json({ apiKeys: result.results });
}

export async function createManagedApiKey(request: Request, env: Env): Promise<Response> {
  let input: CreateApiKeyInput;
  try {
    input = await request.json();
  } catch {
    return error("Request body must be valid JSON.", 400);
  }
  if (typeof input.name !== "string") return error("name is required.", 400);

  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) return error("name must contain 1 to 100 characters.", 400);
  if (input.scope !== "read" && input.scope !== "write") return error("scope must be read or write.", 400);

  const key = createApiKeyValue();
  const result = await env.DB.prepare(
    `INSERT INTO api_keys (name, key_hash, scope)
     VALUES (?, ?, ?)
     RETURNING id, name, scope, created_at, last_used_at, revoked_at`,
  ).bind(name, await hashApiKey(key, env), input.scope).all<ApiKey>();
  return result.results[0] ? json({ apiKey: result.results[0], key }, 201) : error("Could not create API key.", 500);
}

export async function revokeApiKey(id: number, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL",
  ).bind(id).run();
  return result.meta.changes === 0 ? error("API key not found or already revoked.", 404) : json({ revoked: true });
}

export async function deleteRevokedApiKey(id: number, env: Env): Promise<Response> {
  const result = await env.DB.prepare("DELETE FROM api_keys WHERE id = ? AND revoked_at IS NOT NULL").bind(id).run();
  return result.meta.changes === 0 ? error("Revoked API key not found.", 404) : json({ deleted: true });
}
