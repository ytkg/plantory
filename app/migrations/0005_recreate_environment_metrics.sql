DROP TABLE environment_metrics;

CREATE TABLE environment_metrics (
  id INTEGER PRIMARY KEY,
  temperature REAL NOT NULL,
  humidity REAL NOT NULL,
  co2 INTEGER NOT NULL,
  created_at DATETIME NOT NULL
);

CREATE INDEX idx_environment_metrics_created_at
  ON environment_metrics (created_at DESC);
