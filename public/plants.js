const plantsElement = document.querySelector("#plants");
const plantCountElement = document.querySelector("#plant-count");
const dialog = document.querySelector("#create-plant-dialog");
const form = document.querySelector("#create-plant-form");
const nameInput = document.querySelector("#plant-name");
const errorElement = document.querySelector("#create-plant-error");
const submitButton = document.querySelector("#submit-create-plant");
const metricLabels = {
  soil_moisture: "土壌水分",
  temperature: "温度",
  humidity: "湿度",
  light: "照度",
};

function showMessage(message, error = false) {
  plantsElement.replaceChildren();
  const element = document.createElement("p");
  element.className = error ? "rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-rose-700" : "rounded-2xl border border-dashed border-leaf-100 bg-white/70 px-5 py-10 text-center text-stone-500";
  element.textContent = message;
  plantsElement.append(element);
}

function redirectToLogin() {
  window.location.assign("/login?next=/plants");
}

function metricLabel(type) {
  return metricLabels[type] ?? type.replaceAll("_", " ");
}

function formatValue(value) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(value);
}

function createMetricChart(type, metrics) {
  const latest = metrics[0];
  const values = metrics.slice(0, 30).reverse().map((metric) => metric.value);
  const width = 240;
  const height = 72;
  const padding = 6;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : padding + ((width - padding * 2) * index) / (values.length - 1);
    const y = height - padding - ((value - minimum) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");

  const chart = document.createElement("section");
  chart.className = "rounded-xl bg-leaf-50 p-3";
  const header = document.createElement("div");
  header.className = "flex items-baseline justify-between gap-3";
  const title = document.createElement("h4");
  title.className = "text-xs font-semibold text-stone-600";
  title.textContent = metricLabel(type);
  const value = document.createElement("p");
  value.className = "text-lg font-semibold text-leaf-700";
  value.textContent = formatValue(latest.value);
  header.append(title, value);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "mt-3 h-18 w-full overflow-visible");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${metricLabel(type)}の直近${values.length}件の推移。最新値は${formatValue(latest.value)}。`);
  const baseline = document.createElementNS("http://www.w3.org/2000/svg", "line");
  baseline.setAttribute("x1", String(padding));
  baseline.setAttribute("x2", String(width - padding));
  baseline.setAttribute("y1", String(height - padding));
  baseline.setAttribute("y2", String(height - padding));
  baseline.setAttribute("stroke", "#cfe6d4");
  baseline.setAttribute("stroke-width", "1");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("points", points);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "#27613a");
  line.setAttribute("stroke-width", "2.5");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");
  svg.append(baseline, line);
  chart.append(header, svg);
  return chart;
}

function createPlantCard(plant, metrics) {
  const item = document.createElement("article");
  item.className = "rounded-2xl border border-leaf-100 bg-white px-5 py-5 shadow-sm";
  const heading = document.createElement("div");
  heading.className = "flex items-center gap-4";
  const icon = document.createElement("span");
  icon.className = "flex size-11 items-center justify-center rounded-xl bg-leaf-100 text-xl";
  icon.textContent = "🪴";
  const name = document.createElement("h3");
  name.className = "text-base font-semibold";
  name.textContent = plant.name;
  heading.append(icon, name);
  item.append(heading);

  const groupedMetrics = new Map();
  for (const metric of metrics) {
    const group = groupedMetrics.get(metric.metric_type) ?? [];
    group.push(metric);
    groupedMetrics.set(metric.metric_type, group);
  }
  if (groupedMetrics.size) {
    const charts = document.createElement("div");
    charts.className = "mt-5 grid gap-3";
    for (const [type, values] of groupedMetrics) charts.append(createMetricChart(type, values));
    item.append(charts);
  }
  return item;
}

async function loadMetrics(plantId) {
  const response = await fetch(`/api/plants/${plantId}/metrics`);
  if (response.status === 401) {
    redirectToLogin();
    return null;
  }
  if (!response.ok) throw new Error();
  const { metrics } = await response.json();
  return metrics;
}

async function loadPlants() {
  try {
    const response = await fetch("/api/plants");
    if (response.status === 401) return redirectToLogin();
    if (!response.ok) throw new Error();
    const { plants } = await response.json();
    plantCountElement.textContent = `${plants.length} 鉢`;
    if (!plants.length) return showMessage("まだ植物が登録されていません。");
    const plantsWithMetrics = await Promise.all(plants.map(async (plant) => ({ plant, metrics: await loadMetrics(plant.id) })));
    if (plantsWithMetrics.some(({ metrics }) => metrics === null)) return;
    plantsElement.replaceChildren(...plantsWithMetrics.map(({ plant, metrics }) => createPlantCard(plant, metrics)));
  } catch {
    plantCountElement.textContent = "—";
    showMessage("植物を読み込めませんでした。", true);
  }
}

function closeDialog() {
  form.reset();
  errorElement.textContent = "";
  errorElement.classList.add("hidden");
  dialog.close();
}

document.querySelector("#open-create-plant").addEventListener("click", () => {
  form.reset();
  errorElement.textContent = "";
  errorElement.classList.add("hidden");
  dialog.showModal();
  nameInput.focus();
});

document.querySelector("#close-create-plant").addEventListener("click", closeDialog);
document.querySelector("#cancel-create-plant").addEventListener("click", closeDialog);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    errorElement.textContent = "植物の名前を入力してください。";
    errorElement.classList.remove("hidden");
    nameInput.focus();
    return;
  }

  submitButton.disabled = true;
  errorElement.classList.add("hidden");
  try {
    const response = await fetch("/api/plants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.status === 401) return redirectToLogin();
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "植物を追加できませんでした。");
    }
    closeDialog();
    await loadPlants();
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : "植物を追加できませんでした。";
    errorElement.classList.remove("hidden");
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#logout").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.assign("/");
});

void loadPlants();
