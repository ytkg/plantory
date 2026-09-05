CREATE TABLE environment_metrics (
  id INTEGER PRIMARY KEY,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('temperature', 'humidity', 'co2')),
  value REAL NOT NULL,
  created_at DATETIME NOT NULL
);

CREATE INDEX idx_environment_metrics_created_at
  ON environment_metrics (created_at DESC);
