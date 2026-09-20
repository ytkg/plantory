import { logout, requestJson } from "./api-client.js";
import { renderMetricChart } from "./metric-chart.js";
import { differenceText, formatChartTooltipLabel, formatMoisture, metricHistoryState } from "./presentation.js";
import { formatDateTime, replaceWithListState, setupMobileMenu } from "./ui.js";

const plantsElement = document.querySelector("#plants");
const plantCountElement = document.querySelector("#plant-count");
const dialog = document.querySelector("#create-plant-dialog");
const form = document.querySelector("#create-plant-form");
const nameInput = document.querySelector("#plant-name");
const errorElement = document.querySelector("#create-plant-error");
const submitButton = document.querySelector("#submit-create-plant");
const displayedAt = Date.now();

function showMessage(message, error = false) {
  replaceWithListState(plantsElement, message, { error });
}

function createMetricChart(metrics) {
  const latest = metrics[0];
  const history = metrics.slice(0, 30).reverse();

  const chart = document.createElement("section");
  chart.className = "rounded-2xl border border-leaf-100 bg-white p-5 shadow-sm";
  const header = document.createElement("div");
  header.className = "flex items-baseline justify-between gap-3";
  const title = document.createElement("h4");
  title.className = "text-lg font-semibold";
  title.textContent = "水分量";
  const value = document.createElement("p");
  value.className = "text-lg font-semibold text-leaf-700";
  value.textContent = `${formatMoisture(latest.value)}%`;
  header.append(title, value);

  const detail = document.createElement("p");
  detail.className = "mt-2 text-sm text-stone-500";
  detail.textContent = `${formatDateTime(latest.created_at)} 受信 · ${differenceText(metrics.map((metric) => metric.value), "%")}`;

  const graph = document.createElement("div");
  graph.className = "mt-5 h-64";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `水分量の直近${history.length}件の推移。最新値は${formatMoisture(latest.value)}%。`);
  graph.append(canvas);
  chart.append(header, detail, graph);

  if (typeof window.Chart !== "function") {
    graph.textContent = "グラフを読み込めませんでした。";
    graph.className = "mt-5 flex h-64 items-center text-sm text-stone-500";
    return chart;
  }

  renderMetricChart(canvas, {
    label: "水分量",
    metrics: history,
    referenceTime: displayedAt,
    tooltipLabel: (value) => formatChartTooltipLabel("水分量", value),
    yScale: { bounds: { min: 0, max: 100 }, tickLabel: (value) => `${value}%` },
  });
  return chart;
}

function createPlantCard(plant, metrics, totalCount) {
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
  if (!metrics.length) {
    const status = document.createElement("p");
    status.className = "mt-1 text-sm text-stone-600";
    status.textContent = totalCount === 0 ? "まだ測定がありません" : "水分量を算出できるデータがありません";
    summary.append(status);
  }
  heading.append(icon, summary);
  item.append(heading);

  if (metricHistoryState(metrics) !== "empty") {
    const charts = document.createElement("div");
    charts.className = "mt-5 grid gap-3";
    charts.append(createMetricChart(metrics));
    const detail = document.createElement("div");
    detail.className = "flex justify-end";
    const detailLink = document.createElement("a");
    detailLink.className = "text-sm font-semibold text-leaf-700 underline underline-offset-4";
    detailLink.href = `/plants/${plant.id}/metrics`;
    detailLink.textContent = "計測データを見る";
    detail.append(detailLink);
    charts.append(detail);
    item.append(charts);
  } else {
    const detailLink = document.createElement("a");
    detailLink.className = "mt-4 inline-block text-sm font-semibold text-leaf-700 underline underline-offset-4";
    detailLink.href = `/plants/${plant.id}/metrics`;
    detailLink.textContent = "計測データを見る";
    item.append(detailLink);
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
    plantsElement.replaceChildren(...plantsWithMetrics.map(({ plant, metrics, totalCount }) => createPlantCard(plant, metrics, totalCount)));
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
setupMobileMenu();

void loadPlants();
