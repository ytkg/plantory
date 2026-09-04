import type { Context } from "hono";
import { authenticate, authenticateSession, unauthorized } from "../auth";
import { withCookies } from "../http";

export type AppContext = Context<{ Bindings: Env }>;

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
