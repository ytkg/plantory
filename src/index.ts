type Plant = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

type CreatePlantInput = {
  name?: unknown;
};

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status });

const error = (message: string, status: number): Response =>
  json({ error: message }, status);

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    try {
      if (pathname === "/") {
        return json({ name: "Plantory", status: "ok" });
      }

      if (pathname === "/api/plants") {
        if (request.method === "GET") {
          return listPlants(env);
        }

        if (request.method === "POST") {
          return createPlant(request, env);
        }

        return new Response(null, {
          status: 405,
          headers: { Allow: "GET, POST" },
        });
      }

      return error("Not found.", 404);
    } catch (cause) {
      console.error("Plantory request failed", cause);
      return error("Internal server error.", 500);
    }
  },
};
