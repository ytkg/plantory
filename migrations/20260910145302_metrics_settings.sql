CREATE TABLE `metrics_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`interval_hours` integer DEFAULT 3 NOT NULL,
	CONSTRAINT "metrics_settings_singleton" CHECK("metrics_settings"."id" = 1),
	CONSTRAINT "metrics_settings_interval_hours" CHECK("metrics_settings"."interval_hours" IN (1, 2, 3, 4, 6, 8, 12, 24))
);
