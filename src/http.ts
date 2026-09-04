export const json = (body: unknown, status = 200): Response => Response.json(body, { status });

export const error = (message: string, status: number): Response => json({ error: message }, status);

export function withCookies(response: Response, cookies: string[]): Response {
  if (cookies.length === 0) return response;

  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function resourceId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function methodNotAllowed(methods: string): Response {
  return new Response(null, { status: 405, headers: { Allow: methods } });
}
