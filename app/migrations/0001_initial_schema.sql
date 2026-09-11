CREATE TABLE plants (
  id INTEGER PRIMARY KEY,
  name TEXT,
  created_at DATETIME,
  updated_at DATETIME
);

CREATE TABLE metrics (
  id INTEGER PRIMARY KEY,
  plant_id INTEGER,
  metric_type TEXT,
  value REAL,
  created_at DATETIME,
  FOREIGN KEY (plant_id) REFERENCES plants(id)
);

CREATE TABLE daily_reports (
  id INTEGER PRIMARY KEY,
  plant_id INTEGER,
  date DATE,
  content TEXT,
  created_at DATETIME,
  updated_at DATETIME,
  FOREIGN KEY (plant_id) REFERENCES plants(id)
);
