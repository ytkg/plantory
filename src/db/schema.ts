import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const plants = sqliteTable("plants", { id: integer().primaryKey(), name: text(), createdAt: text("created_at"), updatedAt: text("updated_at") });
export const metrics = sqliteTable("metrics", { id: integer().primaryKey(), plantId: integer("plant_id").references(() => plants.id), metricType: text("metric_type"), value: real(), createdAt: text("created_at") });
export const dailyReports = sqliteTable("daily_reports", { id: integer().primaryKey(), date: text().notNull().unique(), content: text().notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() });
export const apiKeys = sqliteTable("api_keys", { id: integer().primaryKey(), name: text().notNull(), keyHash: text("key_hash").notNull().unique(), scope: text().notNull(), createdAt: text("created_at").notNull(), lastUsedAt: text("last_used_at"), revokedAt: text("revoked_at") });
export const environmentMetrics = sqliteTable("environment_metrics", { id: integer().primaryKey(), temperature: real().notNull(), humidity: real().notNull(), co2: integer().notNull(), createdAt: text("created_at").notNull() }, (table) => [index("idx_environment_metrics_created_at").on(table.createdAt)]);
