import { eq } from "drizzle-orm";
import { db } from "../db";
import { metricsSettings } from "../db/schema";
import type { AppContext } from "../routes/context";

const allowedIntervals = new Set([1, 2, 3, 4, 6, 8, 12, 24]);

export async function getMetricsSettings(c: AppContext): Promise<Response> {
  const settings = await db(c.env.DB).select({ interval_hours: metricsSettings.intervalHours })
    .from(metricsSettings).where(eq(metricsSettings.id, 1)).get();
  return c.json(settings ?? { interval_hours: 3 });
}

export async function updateMetricsSettings(c: AppContext): Promise<Response> {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON." }, 400);
  }
  if (typeof input !== "object" || input === null || Array.isArray(input) ||
      !("interval_hours" in input) || typeof input.interval_hours !== "number" ||
      !allowedIntervals.has(input.interval_hours)) {
    return c.json({ error: "interval_hours must be one of 1, 2, 3, 4, 6, 8, 12, 24." }, 400);
  }

  const intervalHours = input.interval_hours;
  await db(c.env.DB).insert(metricsSettings).values({ id: 1, intervalHours })
    .onConflictDoUpdate({ target: metricsSettings.id, set: { intervalHours } }).run();
  return c.json({ interval_hours: intervalHours });
}
