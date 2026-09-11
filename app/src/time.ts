export function toUtcIsoTimestamp(value: string): string {
  if (value.endsWith("Z")) return value;
  return `${value.replace(" ", "T")}Z`;
}
