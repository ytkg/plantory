import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { plants } from "../db/schema";
import type { AppContext } from "../routes/context";
import type { Plant } from "../types";
import { isJsonObject } from "../validation";

export async function listPlants(c: AppContext): Promise<Response> {
  return c.json({ plants: await listPlantsData(c.env) });
}

export async function listPlantsData(env: Env): Promise<Plant[]> {
  return (await db(env.DB).select({ id: plants.id, name: plants.name, created_at: plants.createdAt, updated_at: plants.updatedAt }).from(plants).orderBy(plants.id).all()) as Plant[];
}

export async function createPlant(c: AppContext): Promise<Response> {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON." }, 400);
  }
  if (!isJsonObject(input) || typeof input.name !== "string") return c.json({ error: "name is required." }, 400);

  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) return c.json({ error: "name must contain 1 to 100 characters." }, 400);

  const result = await db(c.env.DB).insert(plants).values({ name, createdAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` }).returning({ id: plants.id, name: plants.name, created_at: plants.createdAt, updated_at: plants.updatedAt }).all();
  return result[0] ? c.json({ plant: result[0] as Plant }, 201) : c.json({ error: "Could not create plant." }, 500);
}

export async function plantExists(id: number, env: Env): Promise<boolean> {
  return (await db(env.DB).select({ id: plants.id }).from(plants).where(eq(plants.id, id)).limit(1).get()) !== undefined;
}

export async function getPlantData(id: number, env: Env): Promise<Plant | undefined> {
  return await db(env.DB).select({ id: plants.id, name: plants.name, created_at: plants.createdAt, updated_at: plants.updatedAt }).from(plants).where(eq(plants.id, id)).limit(1).get() as Plant | undefined;
}
