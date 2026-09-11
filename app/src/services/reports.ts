import type { DailyReport } from "../types";
import { desc, sql } from "drizzle-orm";
import { db } from "../db";
import { dailyReports } from "../db/schema";
import type { AppContext } from "../routes/context";

type UpsertReportInput = { content?: unknown };

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export async function listReportsData(env: Env): Promise<DailyReport[]> {
  return (await db(env.DB).select({ id: dailyReports.id, date: dailyReports.date, content: dailyReports.content, created_at: dailyReports.createdAt, updated_at: dailyReports.updatedAt }).from(dailyReports).orderBy(desc(dailyReports.date)).limit(30).all()) as DailyReport[];
}

export async function upsertReportData(
  date: string,
  contentValue: unknown,
  env: Env,
): Promise<{ report: DailyReport } | { error: string }> {
  if (!validDate(date)) return { error: "date must be a valid YYYY-MM-DD value." };
  if (typeof contentValue !== "string") return { error: "content is required." };
  const content = contentValue.trim();
  if (content.length === 0 || content.length > 10_000) {
    return { error: "content must contain 1 to 10000 characters." };
  }

  const result = await db(env.DB).insert(dailyReports).values({ date, content, createdAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` }).onConflictDoUpdate({ target: dailyReports.date, set: { content, updatedAt: sql`CURRENT_TIMESTAMP` } }).returning({ id: dailyReports.id, date: dailyReports.date, content: dailyReports.content, created_at: dailyReports.createdAt, updated_at: dailyReports.updatedAt }).all();
  return result[0] ? { report: result[0] as DailyReport } : { error: "Could not save report." };
}

export async function listReports(c: AppContext): Promise<Response> {
  return c.json({ reports: await listReportsData(c.env) });
}

export async function upsertReport(c: AppContext): Promise<Response> {
  const date = c.req.param("date") ?? "";
  let input: UpsertReportInput;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON." }, 400);
  }
  const saved = await upsertReportData(date, input.content, c.env);
  return "report" in saved ? c.json(saved, 200) : c.json(saved, saved.error === "Could not save report." ? 500 : 400);
}
