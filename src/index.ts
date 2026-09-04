type Plant = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

type CreatePlantInput = {
  name?: unknown;
};

type ApiKey = {
  id: number;
  name: string;
  scope: "read" | "write";
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type CreateApiKeyInput = {
  name?: unknown;
  scope?: unknown;
};

type TokenPair = {
  accessToken?: unknown;
  refreshToken?: unknown;
  expiresIn?: unknown;
};

type SessionAuth = {
  kind: "session";
  cookies: string[];
};

type ApiKeyAuth = {
  kind: "apiKey";
  scope: "read" | "write";
  id: number;
};

type Authentication = SessionAuth | ApiKeyAuth | null;

const ACCESS_COOKIE = "plantory_access";
const REFRESH_COOKIE = "plantory_refresh";
const encoder = new TextEncoder();

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status });

const error = (message: string, status: number): Response =>
  json({ error: message }, status);

function withCookies(response: Response, cookies: string[]): Response {
  for (const cookie of cookies) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  const header = request.headers.get("Cookie");
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
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

function expiredCookie(name: string, secure: boolean): string {
  return cookie(name, "", 0, secure);
}

function tokenPairCookies(pair: TokenPair, request: Request): string[] | null {
  if (typeof pair.accessToken !== "string" || typeof pair.refreshToken !== "string") {
    return null;
  }

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
  const response = await authFetch(env, "/verify", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

async function authenticateSession(request: Request, env: Env): Promise<SessionAuth | null> {
  const cookies = parseCookies(request);
  const accessToken = cookies.get(ACCESS_COOKIE);

  if (accessToken && (await verifyAccessToken(accessToken, env))) {
    return { kind: "session", cookies: [] };
  }

  const refreshToken = cookies.get(REFRESH_COOKIE);
  if (!refreshToken) return null;

  const response = await authFetch(env, "/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return null;

  const pair = (await response.json()) as TokenPair;
  const refreshedCookies = tokenPairCookies(pair, request);
  return refreshedCookies ? { kind: "session", cookies: refreshedCookies } : null;
}

function authorizationToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashApiKey(key: string, env: Env): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${env.API_KEY_PEPPER}:${key}`),
  );
  return toHex(digest);
}

function createApiKeyValue(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `plnt_${encoded}`;
}

async function authenticateApiKey(
  request: Request,
  env: Env,
  requiredScope: "read" | "write",
  ctx: ExecutionContext,
): Promise<ApiKeyAuth | null> {
  const key = authorizationToken(request);
  if (!key?.startsWith("plnt_")) return null;

  const keyHash = await hashApiKey(key, env);
  const apiKey = await env.DB.prepare(
    `SELECT id, scope FROM api_keys
     WHERE key_hash = ? AND revoked_at IS NULL
     LIMIT 1`,
  )
    .bind(keyHash)
    .first<Pick<ApiKey, "id" | "scope">>();

  if (!apiKey || (requiredScope === "write" && apiKey.scope !== "write")) {
    return null;
  }

  ctx.waitUntil(
    env.DB.prepare("UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(apiKey.id)
      .run()
      .then(
        () => undefined,
        (cause) => console.error("Could not update API key usage", cause),
      ),
  );

  return { kind: "apiKey", scope: apiKey.scope, id: apiKey.id };
}

async function authenticate(
  request: Request,
  env: Env,
  requiredScope: "read" | "write",
  ctx: ExecutionContext,
): Promise<Authentication> {
  const session = await authenticateSession(request, env);
  if (session) return session;
  return authenticateApiKey(request, env, requiredScope, ctx);
}

function unauthorized(cookies: string[] = []): Response {
  return withCookies(error("Authentication is required.", 401), cookies);
}

async function listPlants(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT id, name, created_at, updated_at FROM plants ORDER BY id DESC",
  ).all<Plant>();

  return json({ plants: result.results });
}

async function createPlant(request: Request, env: Env): Promise<Response> {
  let input: CreatePlantInput;

  try {
    input = await request.json();
  } catch {
    return error("Request body must be valid JSON.", 400);
  }

  if (typeof input.name !== "string") {
    return error("name is required.", 400);
  }

  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) {
    return error("name must contain 1 to 100 characters.", 400);
  }

  const result = await env.DB.prepare(
    `INSERT INTO plants (name, created_at, updated_at)
     VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id, name, created_at, updated_at`,
  )
    .bind(name)
    .all<Plant>();

  const plant = result.results[0];
  if (!plant) {
    return error("Could not create plant.", 500);
  }

  return json({ plant }, 201);
}

async function login(request: Request, env: Env): Promise<Response> {
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
  if (!cookies) return error("Authentication service returned an invalid response.", 502);
  return withCookies(json({ authenticated: true }), cookies);
}

function logout(request: Request): Response {
  const secure = new URL(request.url).protocol === "https:";
  return withCookies(json({ authenticated: false }), [
    expiredCookie(ACCESS_COOKIE, secure),
    expiredCookie(REFRESH_COOKIE, secure),
  ]);
}

async function listApiKeys(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT id, name, scope, created_at, last_used_at, revoked_at
     FROM api_keys ORDER BY id DESC`,
  ).all<ApiKey>();
  return json({ apiKeys: result.results });
}

async function createManagedApiKey(request: Request, env: Env): Promise<Response> {
  let input: CreateApiKeyInput;
  try {
    input = await request.json();
  } catch {
    return error("Request body must be valid JSON.", 400);
  }

  if (typeof input.name !== "string") return error("name is required.", 400);
  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) {
    return error("name must contain 1 to 100 characters.", 400);
  }
  if (input.scope !== "read" && input.scope !== "write") {
    return error("scope must be read or write.", 400);
  }

  const key = createApiKeyValue();
  const keyHash = await hashApiKey(key, env);
  const result = await env.DB.prepare(
    `INSERT INTO api_keys (name, key_hash, scope)
     VALUES (?, ?, ?)
     RETURNING id, name, scope, created_at, last_used_at, revoked_at`,
  )
    .bind(name, keyHash, input.scope)
    .all<ApiKey>();

  const apiKey = result.results[0];
  if (!apiKey) return error("Could not create API key.", 500);
  return json({ apiKey, key }, 201);
}

async function revokeApiKey(id: number, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL",
  )
    .bind(id)
    .run();
  return result.meta.changes === 0 ? error("API key not found or already revoked.", 404) : json({ revoked: true });
}

async function protectedAsset(path: string, request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = path;
  return env.ASSETS.fetch(new Request(url.toString(), request));
}

function redirectToLogin(request: Request, cookies: string[]): Response {
  const url = new URL(request.url);
  url.pathname = "/login";
  url.search = "";
  return withCookies(Response.redirect(url.toString(), 302), cookies);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    try {
      if (pathname === "/api/auth/login" && request.method === "POST") {
        return login(request, env);
      }

      if (pathname === "/api/auth/logout" && request.method === "POST") {
        return logout(request);
      }

      if (pathname === "/plants" || pathname === "/settings/api-keys") {
        const session = await authenticateSession(request, env);
        if (!session) return redirectToLogin(request, []);
        const asset = pathname === "/plants" ? "/plants.html" : "/api-keys.html";
        return withCookies(await protectedAsset(asset, request, env), session.cookies);
      }

      if (pathname === "/") {
        const session = await authenticateSession(request, env);
        if (session) {
          return withCookies(await protectedAsset("/index-authenticated.html", request, env), session.cookies);
        }
        return protectedAsset("/index.html", request, env);
      }

      if (pathname === "/api/plants") {
        const requiredScope = request.method === "GET" ? "read" : "write";
        const authentication = await authenticate(request, env, requiredScope, ctx);
        if (!authentication) return unauthorized();
        const cookies = authentication.kind === "session" ? authentication.cookies : [];

        if (request.method === "GET") {
          return withCookies(await listPlants(env), cookies);
        }

        if (request.method === "POST") {
          return withCookies(await createPlant(request, env), cookies);
        }

        return new Response(null, {
          status: 405,
          headers: { Allow: "GET, POST" },
        });
      }

      if (pathname === "/api/api-keys") {
        const session = await authenticateSession(request, env);
        if (!session) return unauthorized();
        if (request.method === "GET") return withCookies(await listApiKeys(env), session.cookies);
        if (request.method === "POST") return withCookies(await createManagedApiKey(request, env), session.cookies);
        return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
      }

      const revokeMatch = pathname.match(/^\/api\/api-keys\/(\d+)\/revoke$/);
      if (revokeMatch && request.method === "POST") {
        const session = await authenticateSession(request, env);
        if (!session) return unauthorized();
        return withCookies(await revokeApiKey(Number(revokeMatch[1]), env), session.cookies);
      }

      if (pathname === "/login") {
        const session = await authenticateSession(request, env);
        return session ? withCookies(Response.redirect(new URL("/plants", request.url).toString(), 302), session.cookies) : protectedAsset("/login.html", request, env);
      }
      if (["/styles.css", "/login.js", "/plants.js", "/api-keys.js", "/authenticated-header.js"].includes(pathname)) {
        return protectedAsset(pathname, request, env);
      }

      return error("Not found.", 404);
    } catch (cause) {
      console.error("Plantory request failed", cause);
      return error("Internal server error.", 500);
    }
  },
};
