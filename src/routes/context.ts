import type { Context } from "hono";
import { authenticate, authenticateSession, unauthorized } from "../auth";

export type AppContext = Context<{ Bindings: Env }>;

export function setCookies(c: AppContext, cookies: string[]): void {
  for (const cookie of cookies) c.header("Set-Cookie", cookie, { append: true });
}

export function notAllowed(c: AppContext, methods: string): Response {
  c.header("Allow", methods);
  return c.body(null, 405);
}

export async function authenticated(c: AppContext, scope: "read" | "write", handler: () => Promise<Response>): Promise<Response> {
  const authentication = await authenticate(c.req.raw, c.env, scope, c.executionCtx);
  if (!authentication) return unauthorized();
  const response = await handler();
  if (authentication.kind === "session") setCookies(c, authentication.cookies);
  return response;
}

export async function sessionOnly(c: AppContext, handler: () => Promise<Response>): Promise<Response> {
  const session = await authenticateSession(c.req.raw, c.env);
  if (!session) return unauthorized();
  setCookies(c, session.cookies);
  return handler();
}
