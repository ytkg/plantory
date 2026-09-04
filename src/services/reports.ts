import { error, json } from "../http";
import type { DailyReport } from "../types";

type UpsertReportInput = { content?: unknown };

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export async function listReports(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT id, date, content, created_at, updated_at
     FROM daily_reports
     ORDER BY date DESC
     LIMIT 30`,
  ).all<DailyReport>();
  return json({ reports: result.results });
}

export async function upsertReport(date: string, request: Request, env: Env): Promise<Response> {
  if (!validDate(date)) return error("date must be a valid YYYY-MM-DD value.", 400);

  let input: UpsertReportInput;
  try {
    input = await request.json();
  } catch {
    return error("Request body must be valid JSON.", 400);
  }
  if (typeof input.content !== "string") return error("content is required.", 400);
  const content = input.content.trim();
  if (content.length === 0 || content.length > 10_000) {
    return error("content must contain 1 to 10000 characters.", 400);
  }

  const result = await env.DB.prepare(
    `INSERT INTO daily_reports (date, content, created_at, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
     RETURNING id, date, content, created_at, updated_at`,
  ).bind(date, content).all<DailyReport>();

  return result.results[0] ? json({ report: result.results[0] }, 200) : error("Could not save report.", 500);
}
