import { withCookies } from "./http";

export async function protectedAsset(path: string, request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = path;
  return env.ASSETS.fetch(new Request(url.toString(), request));
}

export function redirectToLogin(request: Request): Response {
  const currentUrl = new URL(request.url);
  const url = new URL("/login", request.url);
  url.searchParams.set("next", `${currentUrl.pathname}${currentUrl.search}`);
  return Response.redirect(url.toString(), 302);
}

export function loginDestination(request: Request): string {
  const next = new URL(request.url).searchParams.get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export { withCookies };
