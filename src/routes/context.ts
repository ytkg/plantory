import type { Context } from "hono";
import { authenticate, authenticateSession, unauthorized } from "../auth";

export type AppContext = Context<{ Bindings: Env }>;

export function withCookies(response: Response, cookies: string[]): Response {
  if (!cookies.length) return response;
  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function notAllowed(c: AppContext, methods: string): Response {
  c.header("Allow", methods);
  return c.body(null, 405);
}

export async function authenticated(c: AppContext, scope: "read" | "write", handler: () => Promise<Response>): Promise<Response> {
  const authentication = await authenticate(c.req.raw, c.env, scope, c.executionCtx);
  if (!authentication) return unauthorized();
  const response = await handler();
  return authentication.kind === "session" ? withCookies(response, authentication.cookies) : response;
}

export async function sessionOnly(c: AppContext, handler: () => Promise<Response>): Promise<Response> {
  const session = await authenticateSession(c.req.raw, c.env);
  if (!session) return unauthorized();
  return withCookies(await handler(), session.cookies);
}
