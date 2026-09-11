const environmentSection = document.querySelector("#environment-status");
const environmentCards = document.querySelector("#environment-status-cards");
const environmentUpdatedAt = document.querySelector("#environment-status-updated-at");

const measurements = [
  ["temperature", "室温", "℃", 1],
  ["humidity", "湿度", "%", 0],
  ["co2", "CO₂", "ppm", 0],
];

function formatValue(value, fractionDigits) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: fractionDigits }).format(value);
}

function formatUpdatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function showEnvironment(environment) {
  if (!environment || typeof environment !== "object") return;
  if (measurements.some(([key]) => !Number.isFinite(Number(environment[key])))) return;

  const updatedAt = formatUpdatedAt(environment.created_at);
  if (!updatedAt) return;

  environmentCards.replaceChildren();
  for (const [key, label, unit, fractionDigits] of measurements) {
    const card = document.createElement("article");
    card.className = "rounded-2xl border border-leaf-100 bg-white p-4 shadow-sm";

    const name = document.createElement("h3");
    name.className = "text-sm font-semibold text-ink";
    name.textContent = label;

    const value = document.createElement("p");
    value.className = "mt-3 text-xl font-semibold text-leaf-700";
    value.textContent = `${formatValue(Number(environment[key]), fractionDigits)}${unit}`;

    card.append(name, value);
    environmentCards.append(card);
  }

  environmentUpdatedAt.textContent = `最終取得 ${updatedAt}`;
  environmentSection.classList.remove("hidden");
}

async function loadEnvironment() {
  try {
    const response = await fetch("/api/environment");
    if (!response.ok) return;
    const { environment } = await response.json();
    showEnvironment(environment);
  } catch {
    // Environment data is optional; keep the rest of the page available.
  }
}

void loadEnvironment();
