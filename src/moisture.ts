export type MoistureMetric = {
  plant_id: number;
  name: string;
  metric_type: string;
  value: number;
  lower: number;
  upper: number;
};

export type MoistureRange = { lower: number; upper: number };
export type MoistureDirection = "increasing" | "decreasing";

const MOISTURE_DIRECTIONS: Readonly<Record<string, MoistureDirection>> = {
  soil_moisture: "decreasing",
  weight: "increasing",
};

export function getMoistureDirection(metricType: string): MoistureDirection | null {
  return MOISTURE_DIRECTIONS[metricType] ?? null;
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function calculateMoistureRange(values: number[]): MoistureRange | null {
  const lower = percentile(values, 0.05);
  const upper = percentile(values, 0.95);
  return lower === null || upper === null || lower === upper ? null : { lower, upper };
}

export type MoistureStatus = {
  name: string;
  moisture: number;
};

export function selectMoistureMetric(metrics: MoistureMetric[]): MoistureMetric | null {
  return metrics.find((metric) => metric.metric_type === "soil_moisture")
    ?? metrics.find((metric) => metric.metric_type === "weight")
    ?? null;
}

export function calculateMoisturePercentage(value: number, range: MoistureRange, metricType: string): number | null {
  const direction = getMoistureDirection(metricType);
  if (!direction || range.lower === range.upper) return null;
  const raw = direction === "decreasing"
    ? ((range.upper - value) / (range.upper - range.lower)) * 100
    : ((value - range.lower) / (range.upper - range.lower)) * 100;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

export function toMoistureStatus(metric: MoistureMetric): MoistureStatus | null {
  const moisture = calculateMoisturePercentage(metric.value, metric, metric.metric_type);
  if (moisture === null) return null;
  return {
    name: metric.name,
    moisture,
  };
}

export function buildMoistureStatuses(metrics: MoistureMetric[]): MoistureStatus[] {
  const byPlant = new Map<number, MoistureMetric[]>();
  for (const metric of metrics) {
    const plantMetrics = byPlant.get(metric.plant_id) ?? [];
    plantMetrics.push(metric);
    byPlant.set(metric.plant_id, plantMetrics);
  }

  return [...byPlant.values()]
    .map(selectMoistureMetric)
    .map((metric) => (metric ? toMoistureStatus(metric) : null))
    .filter((status): status is MoistureStatus => status !== null);
}
