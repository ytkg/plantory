CREATE TABLE daily_reports_new (
  id INTEGER PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO daily_reports_new (date, content, created_at, updated_at)
SELECT
  date,
  content,
  COALESCE(created_at, CURRENT_TIMESTAMP),
  COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
FROM daily_reports
WHERE id IN (
  SELECT MAX(id)
  FROM daily_reports
  WHERE date IS NOT NULL AND content IS NOT NULL
  GROUP BY date
);

DROP TABLE daily_reports;
ALTER TABLE daily_reports_new RENAME TO daily_reports;
