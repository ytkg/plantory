import { sql } from "drizzle-orm";
import { check, customType, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const date = customType<{ data: string; driverData: string }>({
  dataType() {
    return "DATE";
  },
});

const dateTime = customType<{ data: string; driverData: string }>({
  dataType() {
    return "DATETIME";
  },
});

export const plants = sqliteTable("plants", {
  id: integer().primaryKey(),
  name: text(),
  createdAt: dateTime("created_at"),
  updatedAt: dateTime("updated_at"),
});

export const metrics = sqliteTable("metrics", {
  id: integer().primaryKey(),
  plantId: integer("plant_id").references(() => plants.id),
  metricType: text("metric_type"),
  value: real(),
  createdAt: dateTime("created_at"),
});

export const dailyReports = sqliteTable("daily_reports", {
  id: integer().primaryKey(),
  date: date("date").notNull().unique(),
  content: text("content").notNull(),
  createdAt: dateTime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: dateTime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: integer().primaryKey(),
    name: text().notNull(),
    keyHash: text("key_hash").notNull().unique(),
    scope: text().notNull(),
    createdAt: dateTime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastUsedAt: dateTime("last_used_at"),
    revokedAt: dateTime("revoked_at"),
  },
  (table) => [check("api_keys_scope", sql`${table.scope} IN ('read', 'write')`)],
);

export const environmentMetrics = sqliteTable(
  "environment_metrics",
  {
    id: integer().primaryKey(),
    temperature: real().notNull(),
    humidity: real().notNull(),
    co2: integer().notNull(),
    createdAt: dateTime("created_at").notNull(),
  },
  (table) => [index("idx_environment_metrics_created_at").on(table.createdAt)],
);
