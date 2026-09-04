import { logout, requestJson } from "./api-client.js";

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
  element.className = error
    ? "rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-rose-700 shadow-sm"
    : "rounded-2xl border border-leaf-100 bg-white px-5 py-6 text-center text-stone-500 shadow-sm";
  element.textContent = message;
  plantsElement.append(element);
}

function metricLabel(type) {
  return metricLabels[type] ?? type.replaceAll("_", " ");
}

function formatValue(value) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(value);
}

function formatMeasuredAt(value) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function differenceText(metrics) {
  if (metrics.length < 2) return "比較データはまだありません";
  const difference = metrics[0].value - metrics[1].value;
  if (difference === 0) return "前回と同じ";
  return `前回から ${difference > 0 ? "+" : ""}${formatValue(difference)}`;
}

function createMetricChart(type, metrics) {
  const latest = metrics[0];
  const history = metrics.slice(0, 30).reverse();

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

  const detail = document.createElement("p");
  detail.className = "mt-1 text-xs text-stone-500";
  detail.textContent = `${formatMeasuredAt(latest.created_at)} 受信 · ${differenceText(metrics)}`;

  const graph = document.createElement("div");
  graph.className = "mt-3 h-32";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${metricLabel(type)}の直近${history.length}件の推移。最新値は${formatValue(latest.value)}。`);
  graph.append(canvas);
  chart.append(header, detail, graph);

  if (typeof window.Chart !== "function") {
    graph.textContent = "グラフを読み込めませんでした。";
    graph.className = "mt-3 flex h-32 items-center text-sm text-stone-500";
    return chart;
  }

  new window.Chart(canvas, {
    type: "line",
    data: {
      labels: history.map((metric) => metric.created_at),
      datasets: [{
        data: history.map((metric) => metric.value),
        borderColor: "#27613a",
        borderWidth: 2,
        pointBackgroundColor: "#27613a",
        pointRadius: history.length === 1 ? 3 : 0,
        pointHoverRadius: 4,
        tension: 0.25,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title(items) {
              return formatMeasuredAt(history[items[0].dataIndex].created_at);
            },
            label(context) {
              return `${metricLabel(type)}: ${formatValue(context.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: { display: false },
        y: {
          border: { display: false },
          grid: { color: "#e5f3e8" },
          ticks: { color: "#78716c", maxTicksLimit: 3 },
        },
      },
    },
  });
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
  const summary = document.createElement("div");
  summary.append(name);
  const latest = metrics[0];
  const status = document.createElement("p");
  status.className = "mt-1 text-sm text-stone-600";
  status.textContent = latest
    ? `最新: ${metricLabel(latest.metric_type)} ${formatValue(latest.value)} · ${formatMeasuredAt(latest.created_at)}`
    : "まだ測定がありません";
  summary.append(status);
  heading.append(icon, summary);
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
  return (await requestJson(`/api/plants/${plantId}/metrics`)).metrics;
}

async function loadPlants() {
  try {
    const { plants } = await requestJson("/api/plants");
    plantCountElement.textContent = `${plants.length} 鉢`;
    if (!plants.length) return showMessage("まだ植物が登録されていません。");
    const plantsWithMetrics = await Promise.all(plants.map(async (plant) => ({ plant, metrics: await loadMetrics(plant.id) })));
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
    await requestJson("/api/plants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    closeDialog();
    await loadPlants();
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : "植物を追加できませんでした。";
    errorElement.classList.remove("hidden");
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelectorAll(".logout").forEach((button) => button.addEventListener("click", logout));

void loadPlants();
