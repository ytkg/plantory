import { McpServer } from "@modelcontextprotocol/server";
import { environmentHistory } from "./services/environment";
import { listPlantsData, metricHistory, plantObservationData } from "./services/plants";
import { listReportsData, upsertReportData } from "./services/reports";
import { fetchDailyWeather } from "./services/weather";
import { historyQuery, type HistoryQuery } from "./validation";
import { z } from "zod";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function error(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function parseHistoryInput(input: { from?: string; to?: string; limit?: number }): HistoryQuery | string {
  const searchParams = new URLSearchParams();
  if (input.from !== undefined) searchParams.set("from", input.from);
  if (input.to !== undefined) searchParams.set("to", input.to);
  if (input.limit !== undefined) searchParams.set("limit", String(input.limit));
  const parsed = historyQuery(searchParams);
  return "error" in parsed ? parsed.error : parsed.value;
}

const historyInputSchema = {
  from: z.string().optional().describe("日本時間の開始日。YYYY-MM-DD。省略時は制限しない。"),
  to: z.string().optional().describe("日本時間の終了日。YYYY-MM-DD。省略時は制限しない。"),
  limit: z.number().int().min(1).max(1000).optional().describe("返す最大件数。省略時は100。"),
};

export function createPlantoryMcpServer(env: Env, canWrite = false): McpServer {
  const server = new McpServer({ name: "plantory", version: "0.1.0" });

  server.registerTool(
    "list_plants",
    { description: "Plantoryに登録された植物をID昇順で取得する。" },
    async () => result({ plants: await listPlantsData(env) }),
  );

  server.registerTool(
    "get_plant_moisture_history",
    {
      description: "指定した植物の正規化済み水分量履歴を取得する。日時はUTCのISO 8601形式で返り、from/toは日本時間の暦日として扱う。",
      inputSchema: { plant_id: z.number().int().positive().describe("植物ID。"), ...historyInputSchema },
    },
    async ({ plant_id, from, to, limit }) => {
      const query = parseHistoryInput({ from, to, limit });
      if (typeof query === "string") return error(query);
      const history = await metricHistory(plant_id, query, env);
      return history ? result(history) : error("Plant not found.");
    },
  );

  server.registerTool(
    "get_plant_observation_data",
    {
      description: "観察日記のために、指定した植物の正規化済み水分量履歴、生値の履歴、正規化の採用元・方向・P5/P95をまとめて取得する。生値はmetric_typeごとに返り、日時はUTCのISO 8601形式で返る。from/toは日本時間の暦日として扱う。",
      inputSchema: { plant_id: z.number().int().positive().describe("植物ID。"), ...historyInputSchema },
    },
    async ({ plant_id, from, to, limit }) => {
      const query = parseHistoryInput({ from, to, limit });
      if (typeof query === "string") return error(query);
      const observation = await plantObservationData(plant_id, query, env);
      return observation ? result(observation) : error("Plant not found.");
    },
  );

  server.registerTool(
    "get_environment_history",
    {
      description: "室内の温度、湿度、CO₂濃度の観測履歴を取得する。日時はUTCのISO 8601形式で返り、from/toは日本時間の暦日として扱う。",
      inputSchema: historyInputSchema,
    },
    async ({ from, to, limit }) => {
      const query = parseHistoryInput({ from, to, limit });
      return typeof query === "string" ? error(query) : result({ environmentMetrics: await environmentHistory(query, env) });
    },
  );

  server.registerTool(
    "get_daily_weather",
    {
      description: "西東京市周辺の屋外天気を日別で取得する。from/toは日本時間のYYYY-MM-DDで必須。",
      inputSchema: {
        from: z.string().describe("開始日。YYYY-MM-DD。"),
        to: z.string().describe("終了日。YYYY-MM-DD。"),
      },
    },
    async ({ from, to }) => {
      const query = parseHistoryInput({ from, to });
      if (typeof query === "string") return error(query);
      if (!query.from || !query.to) return error("from and to are required.");
      const weather = await fetchDailyWeather(query.from, query.to);
      return weather ? result({ weather }) : error("Could not fetch weather data.");
    },
  );

  server.registerTool(
    "get_observation_reports",
    { description: "過去の観察日記を新しい日付順に最大30件取得する。" },
    async () => result({ reports: await listReportsData(env) }),
  );

  if (canWrite) {
    server.registerTool(
      "upsert_observation_report",
      {
        description: "指定日の観察日記を作成または更新する。同じ日付の記録がある場合は内容を置き換える。",
        inputSchema: {
          date: z.string().describe("観察日記の日付。日本時間のYYYY-MM-DD。"),
          content: z.string().describe("観察日記の本文。前後の空白を除いて1〜10000文字。"),
        },
      },
      async ({ date, content }) => {
        const saved = await upsertReportData(date, content, env);
        return "report" in saved ? result(saved) : error(saved.error);
      },
    );
  }

  return server;
}
