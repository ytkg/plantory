export type MoistureMetric = {
  plant_id: number;
  name: string;
  metric_type: "soil_moisture" | "weight";
  value: number;
  min_value: number;
  max_value: number;
};

export type MoistureStatus = {
  name: string;
  moisture: number;
};

export function selectMoistureMetric(metrics: MoistureMetric[]): MoistureMetric | null {
  const soilMoisture = metrics.find((metric) => metric.metric_type === "soil_moisture");
  return soilMoisture ?? metrics.find((metric) => metric.metric_type === "weight") ?? null;
}

export function toMoistureStatus(metric: MoistureMetric): MoistureStatus | null {
  if (metric.min_value === metric.max_value) return null;
  return {
    name: metric.name,
    moisture: Math.round(((metric.value - metric.min_value) / (metric.max_value - metric.min_value)) * 100),
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
