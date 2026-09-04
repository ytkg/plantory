import { logout, requestJson } from "./api-client.js";
import { formatDateTime, replaceWithListState } from "./ui.js";

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
  replaceWithListState(plantsElement, message, { error });
}

function metricLabel(type) {
  return metricLabels[type] ?? type.replaceAll("_", " ");
}

function formatValue(value) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(value);
}

function differenceText(metrics) {
  if (metrics.length < 2) return "比較データはまだありません";
  const difference = metrics[0].value - metrics[1].value;
  if (difference === 0) return "前回と同じ";
  return `前回から ${difference > 0 ? "+" : ""}${formatValue(difference)}`;
}

function normalizeToPercentage(value, range) {
  if (range.max === range.min) return 50;
  return ((value - range.min) / (range.max - range.min)) * 100;
}

function createMetricChart(type, metrics, metricRange) {
  const latest = metrics[0];
  const history = metrics.slice(0, 30).reverse();
  const range = metricRange ?? {
    min: Math.min(...metrics.map((metric) => metric.value)),
    max: Math.max(...metrics.map((metric) => metric.value)),
  };
  const showRelativeMoisture = type === "soil_moisture" && range.max !== range.min;

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
  detail.textContent = `${formatDateTime(latest.created_at)} 受信 · ${differenceText(metrics)}${showRelativeMoisture ? ` · ${formatValue(range.min)}–${formatValue(range.max)} を0–100%換算` : ""}`;

  const graph = document.createElement("div");
  graph.className = "mt-3 h-32";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${metricLabel(type)}の直近${history.length}件の推移。最新値は${formatValue(latest.value)}。${showRelativeMoisture ? "水分量を過去の最小値0%、最大値100%として併記。" : ""}`);
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
      datasets: [
        {
          label: metricLabel(type),
          data: history.map((metric) => metric.value),
          borderColor: "#27613a",
          borderWidth: 2,
          pointBackgroundColor: "#27613a",
          pointRadius: history.length === 1 ? 3 : 0,
          pointHoverRadius: 4,
          tension: 0.25,
        },
        ...(showRelativeMoisture
          ? [{
              label: "水分量（相対%）",
              data: history.map((metric) => normalizeToPercentage(metric.value, range)),
              yAxisID: "percentage",
              borderColor: "#5b6db1",
              borderDash: [5, 4],
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.25,
            }]
          : []),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: showRelativeMoisture,
          labels: { boxWidth: 10, boxHeight: 2, color: "#57534e", font: { size: 11 } },
        },
        tooltip: {
          displayColors: false,
          callbacks: {
            title(items) {
              return formatDateTime(history[items[0].dataIndex].created_at);
            },
            label(context) {
              return context.dataset.yAxisID === "percentage"
                ? `${context.dataset.label}: ${formatValue(context.parsed.y)}%`
                : `${context.dataset.label}: ${formatValue(context.parsed.y)}`;
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
        ...(showRelativeMoisture
          ? {
              percentage: {
                position: "right",
                min: 0,
                max: 100,
                border: { display: false },
                grid: { drawOnChartArea: false },
                ticks: { color: "#5b6db1", callback: (value) => `${value}%`, maxTicksLimit: 3 },
              },
            }
          : {}),
      },
    },
  });
  return chart;
}

function createPlantCard(plant, metrics, metricRanges) {
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
    ? `最新: ${metricLabel(latest.metric_type)} ${formatValue(latest.value)} · ${formatDateTime(latest.created_at)}`
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
    for (const [type, values] of groupedMetrics) charts.append(createMetricChart(type, values, metricRanges[type]));
    item.append(charts);
  }
  return item;
}

async function loadMetrics(plantId) {
  return requestJson(`/api/plants/${plantId}/metrics`);
}

async function loadPlants() {
  try {
    const { plants } = await requestJson("/api/plants");
    plantCountElement.textContent = `${plants.length} 鉢`;
    if (!plants.length) return showMessage("まだ植物が登録されていません。");
    const plantsWithMetrics = await Promise.all(plants.map(async (plant) => ({ plant, ...(await loadMetrics(plant.id)) })));
    plantsElement.replaceChildren(...plantsWithMetrics.map(({ plant, metrics, metricRanges }) => createPlantCard(plant, metrics, metricRanges)));
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
