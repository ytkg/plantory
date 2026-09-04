import { error, json, withCookies } from "./http";
import type { ApiKey, ApiKeyAuth, Authentication, Scope, SessionAuth, TokenPair } from "./types";

const ACCESS_COOKIE = "plantory_access";
const REFRESH_COOKIE = "plantory_refresh";
const encoder = new TextEncoder();

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  const header = request.headers.get("Cookie");
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator !== -1) cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function tokenPairCookies(pair: TokenPair, request: Request): string[] | null {
  if (typeof pair.accessToken !== "string" || typeof pair.refreshToken !== "string") return null;

  const maxAge = typeof pair.expiresIn === "number" ? pair.expiresIn : 900;
  const secure = new URL(request.url).protocol === "https:";
  return [
    cookie(ACCESS_COOKIE, pair.accessToken, maxAge, secure),
    cookie(REFRESH_COOKIE, pair.refreshToken, 60 * 60 * 24 * 7, secure),
  ];
}

async function authFetch(env: Env, path: string, init: RequestInit): Promise<Response> {
  return fetch(new URL(path, env.AUTH_BASE_URL), init);
}

async function verifyAccessToken(token: string, env: Env): Promise<boolean> {
  return (await authFetch(env, "/verify", { headers: { Authorization: `Bearer ${token}` } })).ok;
}

export async function authenticateSession(request: Request, env: Env): Promise<SessionAuth | null> {
  const cookies = parseCookies(request);
  const accessToken = cookies.get(ACCESS_COOKIE);
  if (accessToken && (await verifyAccessToken(accessToken, env))) return { kind: "session", cookies: [] };

  const refreshToken = cookies.get(REFRESH_COOKIE);
  if (!refreshToken) return null;

  const response = await authFetch(env, "/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return null;

  const refreshedCookies = tokenPairCookies((await response.json()) as TokenPair, request);
  return refreshedCookies ? { kind: "session", cookies: refreshedCookies } : null;
}

function authorizationToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export async function hashApiKey(key: string, env: Env): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${env.API_KEY_PEPPER}:${key}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createApiKeyValue(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `plnt_${encoded}`;
}

async function authenticateApiKey(
  request: Request,
  env: Env,
  requiredScope: Scope,
  ctx: ExecutionContext,
): Promise<ApiKeyAuth | null> {
  const key = authorizationToken(request);
  if (!key?.startsWith("plnt_")) return null;

  const apiKey = await env.DB.prepare(
    `SELECT id, scope FROM api_keys
     WHERE key_hash = ? AND revoked_at IS NULL
     LIMIT 1`,
  )
    .bind(await hashApiKey(key, env))
    .first<Pick<ApiKey, "id" | "scope">>();
  if (!apiKey || (requiredScope === "write" && apiKey.scope !== "write")) return null;

  ctx.waitUntil(
    env.DB.prepare("UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(apiKey.id)
      .run()
      .then(() => undefined, (cause) => console.error("Could not update API key usage", cause)),
  );
  return { kind: "apiKey", scope: apiKey.scope, id: apiKey.id };
}

export async function authenticate(
  request: Request,
  env: Env,
  requiredScope: Scope,
  ctx: ExecutionContext,
): Promise<Authentication> {
  return (await authenticateSession(request, env)) ?? authenticateApiKey(request, env, requiredScope, ctx);
}

export function unauthorized(): Response {
  return error("Authentication is required.", 401);
}

export async function login(request: Request, env: Env): Promise<Response> {
  let credentials: { username?: unknown; password?: unknown };
  try {
    credentials = await request.json();
  } catch {
    return error("Request body must be valid JSON.", 400);
  }
  if (typeof credentials.username !== "string" || typeof credentials.password !== "string") {
    return error("username and password are required.", 400);
  }

  const response = await authFetch(env, "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: credentials.username, password: credentials.password }),
  });
  if (response.status === 401) return error("Invalid username or password.", 401);
  if (!response.ok) return error("Authentication service is unavailable.", 502);

  const cookies = tokenPairCookies((await response.json()) as TokenPair, request);
  return cookies ? withCookies(json({ authenticated: true }), cookies) : error("Authentication service returned an invalid response.", 502);
}

export function logout(request: Request): Response {
  const secure = new URL(request.url).protocol === "https:";
  return withCookies(json({ authenticated: false }), [
    cookie(ACCESS_COOKIE, "", 0, secure),
    cookie(REFRESH_COOKIE, "", 0, secure),
  ]);
}
