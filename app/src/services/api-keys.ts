import { createApiKeyValue, hashApiKey } from "../auth";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";
import { apiKeys } from "../db/schema";
import type { ApiKey } from "../types";
import type { AppContext } from "../routes/context";

type CreateApiKeyInput = { name?: unknown; scope?: unknown };

export async function listApiKeys(c: AppContext): Promise<Response> {
  const rows = await db(c.env.DB).select({ id: apiKeys.id, name: apiKeys.name, scope: apiKeys.scope, created_at: apiKeys.createdAt, last_used_at: apiKeys.lastUsedAt, revoked_at: apiKeys.revokedAt }).from(apiKeys).orderBy(desc(apiKeys.id)).all();
  return c.json({ apiKeys: rows as ApiKey[] });
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
  const result = await db(c.env.DB).insert(apiKeys).values({ name, keyHash: await hashApiKey(key, c.env), scope: input.scope }).returning({ id: apiKeys.id, name: apiKeys.name, scope: apiKeys.scope, created_at: apiKeys.createdAt, last_used_at: apiKeys.lastUsedAt, revoked_at: apiKeys.revokedAt }).all();
  return result[0] ? c.json({ apiKey: result[0] as ApiKey, key }, 201) : c.json({ error: "Could not create API key." }, 500);
}

export async function revokeApiKey(id: number, c: AppContext): Promise<Response> {
  const result = await db(c.env.DB).update(apiKeys).set({ revokedAt: new Date().toISOString() }).where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt))).run();
  return result.meta.changes === 0 ? c.json({ error: "API key not found or already revoked." }, 404) : c.json({ revoked: true });
}

export async function deleteRevokedApiKey(id: number, c: AppContext): Promise<Response> {
  const result = await db(c.env.DB).delete(apiKeys).where(and(eq(apiKeys.id, id), isNotNull(apiKeys.revokedAt))).run();
  return result.meta.changes === 0 ? c.json({ error: "Revoked API key not found." }, 404) : c.json({ deleted: true });
}
