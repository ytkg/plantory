import type { DailyReport } from "../types";
import type { AppContext } from "../routes/context";

type UpsertReportInput = { content?: unknown };

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export async function listReportsData(env: Env): Promise<DailyReport[]> {
  const result = await env.DB.prepare(
    `SELECT id, date, content, created_at, updated_at
     FROM daily_reports
     ORDER BY date DESC
     LIMIT 30`,
  ).all<DailyReport>();
  return result.results;
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

  const result = await env.DB.prepare(
    `INSERT INTO daily_reports (date, content, created_at, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
     RETURNING id, date, content, created_at, updated_at`,
  ).bind(date, content).all<DailyReport>();

  return result.results[0] ? { report: result.results[0] } : { error: "Could not save report." };
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
