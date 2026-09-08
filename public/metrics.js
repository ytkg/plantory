import { requestJson, logout } from "./api-client.js";
import { formatDateTime, listStateCard, setupMobileMenu } from "./ui.js";
import { formatRawValue, metricLabel, metricUnit, rawDifferenceText, rawMetricBounds, totalMetricCount } from "./presentation.js";

const content = document.querySelector("#metrics-content");
const plantName = document.querySelector("#metrics-plant-name");
const feedback = document.querySelector("#metrics-feedback");
const deleteDialog = document.querySelector("#delete-metrics-dialog");
const deleteForm = document.querySelector("#delete-metrics-form");
const deleteMessage = document.querySelector("#delete-metrics-message");
const deleteSubmitButton = document.querySelector("#submit-delete-metrics");
const plantId = /^\/plants\/(\d+)\/metrics$/.exec(window.location.pathname)?.[1];
let metricTypes = [];
let selectedType = null;
let selectedRange = "recent";
let visibleHistoryCount = 30;
let rangeWindow = null;
let currentData = null;

function showFeedback(message, error = false) {
  feedback.textContent = message;
  feedback.className = error ? "mt-6 text-sm text-rose-700" : "mt-6 text-sm text-leaf-700";
}

function rawEndpoint(metricType, cursor = null) {
  const params = new URLSearchParams({ metric_type: metricType, limit: "500" });
  if (rangeWindow) {
    params.set("from", rangeWindow.from);
    params.set("to", rangeWindow.to);
  }
  if (cursor) params.set("cursor", cursor);
  return `/api/plants/${plantId}/metrics/raw?${params}`;
}

async function loadAllMetrics(metricType) {
  const first = await requestJson(rawEndpoint(metricType));
  const metrics = [...first.metrics];
  let cursor = first.nextCursor;
  while (cursor) {
    const page = await requestJson(rawEndpoint(metricType, cursor));
    metrics.push(...page.metrics);
    cursor = page.nextCursor;
  }
  return { ...first, metrics };
}

function valueWithUnit(value, unit) {
  return `${formatRawValue(value)}${unit ? ` ${unit}` : ""}`;
}

function rangeLabel(range) {
  return range === "recent" ? "直近30件" : `過去${range}日`;
}

function createSummary(type) {
  const unit = metricUnit(type.metric_type);
  const section = document.createElement("section");
  section.className = "mt-7 rounded-2xl border border-leaf-100 bg-white p-5 shadow-sm";
  const label = document.createElement("h2");
  label.className = "text-sm font-semibold text-stone-600";
  label.textContent = "現在の最新値";
  const value = document.createElement("p");
  value.className = "mt-2 text-3xl font-semibold tracking-tight text-leaf-700";
  value.textContent = type.latest ? valueWithUnit(type.latest.value, unit) : "—";
  const details = document.createElement("dl");
  details.className = "mt-5 grid gap-4 border-t border-leaf-100 pt-4 sm:grid-cols-2";
  const difference = document.createElement("div");
  difference.innerHTML = '<dt class="text-xs font-semibold text-stone-500">前回比</dt><dd class="mt-1 text-sm font-semibold text-ink"></dd>';
  difference.querySelector("dd").textContent = type.latest && type.previous ? rawDifferenceText(type.latest.value, type.previous.value, unit ? ` ${unit}` : "") : "—";
  const recorded = document.createElement("div");
  recorded.innerHTML = '<dt class="text-xs font-semibold text-stone-500">記録日時</dt><dd class="mt-1 text-sm font-semibold text-ink"></dd>';
  recorded.querySelector("dd").textContent = type.latest ? formatDateTime(type.latest.created_at) : "—";
  details.append(difference, recorded);
  section.append(label, value, details);
  return section;
}

function createControls() {
  const controls = document.createElement("div");
  controls.className = "mt-7 flex flex-wrap items-end justify-between gap-4";
  const typeWrap = document.createElement("label");
  typeWrap.className = "grid gap-2 text-sm font-semibold text-stone-600";
  typeWrap.textContent = "メトリクス";
  const typeSelect = document.createElement("select");
  typeSelect.className = "rounded-xl border border-leaf-100 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-100";
  for (const type of metricTypes) {
    const option = document.createElement("option");
    option.value = type.metric_type;
    option.textContent = metricLabel(type.metric_type);
    option.selected = type.metric_type === selectedType;
    typeSelect.append(option);
  }
  typeSelect.addEventListener("change", () => {
    selectedType = typeSelect.value;
    visibleHistoryCount = 30;
    void refresh();
  });
  typeWrap.append(typeSelect);
  if (metricTypes.length === 1) typeWrap.hidden = true;

  const rangeWrap = document.createElement("label");
  rangeWrap.className = "grid gap-2 text-sm font-semibold text-stone-600";
  rangeWrap.textContent = "期間";
  const rangeSelect = document.createElement("select");
  rangeSelect.className = typeSelect.className;
  for (const range of ["recent", "7", "30", "90"]) {
    const option = document.createElement("option");
    option.value = range;
    option.textContent = rangeLabel(range);
    option.selected = range === selectedRange;
    rangeSelect.append(option);
  }
  rangeSelect.addEventListener("change", () => {
    selectedRange = rangeSelect.value;
    visibleHistoryCount = 30;
    void refresh();
  });
  rangeWrap.append(rangeSelect);

  const refreshButton = document.createElement("button");
  refreshButton.className = "rounded-xl border border-leaf-200 bg-white px-4 py-2 text-sm font-semibold text-leaf-700 transition hover:bg-leaf-50 disabled:cursor-wait disabled:opacity-60";
  refreshButton.textContent = "更新";
  refreshButton.addEventListener("click", () => void refresh());
  controls.append(typeWrap, rangeWrap, refreshButton);
  return controls;
}

function createChart(metrics, metricType) {
  const unit = metricUnit(metricType);
  const section = document.createElement("section");
  section.className = "mt-7 rounded-2xl border border-leaf-100 bg-white p-5 shadow-sm";
  const heading = document.createElement("h2");
  heading.className = "text-lg font-semibold";
  heading.textContent = "生値の推移";
  section.append(heading);
  if (!metrics.length) {
    const empty = document.createElement("p");
    empty.className = "mt-4 text-sm text-stone-600";
    empty.textContent = `${rangeLabel(selectedRange)}の記録はありません。`;
    section.append(empty);
    return section;
  }
  const graph = document.createElement("div");
  graph.className = "mt-5 h-64 sm:h-80";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${metricLabel(metricType)}の生値推移。${metrics.length}件の実測値。`);
  graph.append(canvas);
  section.append(graph);
  if (typeof window.Chart !== "function") {
    graph.textContent = "グラフを読み込めませんでした。";
    graph.className = "mt-5 flex h-64 items-center text-sm text-stone-500";
    return section;
  }
  const chronological = [...metrics].reverse();
  const bounds = rawMetricBounds(chronological);
  new window.Chart(canvas, {
    type: "line",
    data: {
      datasets: [{
        label: metricLabel(metricType),
        data: chronological.map((metric) => ({ x: new Date(metric.created_at).getTime(), y: metric.value, created_at: metric.created_at })),
        borderColor: "#27613a",
        borderWidth: 2,
        pointBackgroundColor: "#27613a",
        pointRadius: chronological.length === 1 ? 3 : 2,
        pointHitRadius: 12,
        pointHoverRadius: 5,
        cubicInterpolationMode: "monotone",
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title(items) { return items[0]?.raw?.created_at ? formatDateTime(items[0].raw.created_at) : "日時不明"; },
            label(context) { return `${metricLabel(metricType)}: ${valueWithUnit(context.parsed.y, unit)}`; },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          grid: { color: "#e5f3e8" },
          ticks: { color: "#78716c", maxTicksLimit: 5, callback: (value) => formatDateTime(new Date(Number(value)).toISOString()) },
        },
        y: {
          grid: { color: "#e5f3e8" },
          ticks: { color: "#78716c", callback: (value) => valueWithUnit(value, unit) },
          ...(bounds ?? {}),
        },
      },
    },
  });
  return section;
}

function createHistory(metrics, metricType) {
  const unit = metricUnit(metricType);
  const section = document.createElement("section");
  section.className = "mt-7 rounded-2xl border border-leaf-100 bg-white p-5 shadow-sm";
  const heading = document.createElement("h2");
  heading.className = "text-lg font-semibold";
  heading.textContent = "計測履歴";
  section.append(heading);
  if (!metrics.length) return section;
  const list = document.createElement("dl");
  list.className = "mt-4 divide-y divide-leaf-100";
  for (const metric of metrics.slice(0, visibleHistoryCount)) {
    const row = document.createElement("div");
    row.className = "flex items-baseline justify-between gap-4 py-3";
    const date = document.createElement("dt");
    date.className = "text-sm text-stone-600";
    date.textContent = formatDateTime(metric.created_at);
    const value = document.createElement("dd");
    value.className = "text-right text-sm font-semibold text-ink";
    value.textContent = valueWithUnit(metric.value, unit);
    row.append(date, value);
    list.append(row);
  }
  section.append(list);
  if (visibleHistoryCount < metrics.length) {
    const more = document.createElement("button");
    more.className = "mt-5 rounded-xl border border-leaf-200 bg-white px-4 py-2 text-sm font-semibold text-leaf-700 hover:bg-leaf-50";
    more.textContent = "もっと見る";
    more.addEventListener("click", () => {
      visibleHistoryCount += 30;
      render();
    });
    section.append(more);
  }
  return section;
}

function createDeleteSection(data) {
  const count = totalMetricCount(metricTypes);
  if (count === 0) return null;
  const section = document.createElement("section");
  section.className = "mt-7 rounded-2xl border border-rose-200 bg-rose-50 p-5";
  const heading = document.createElement("h2");
  heading.className = "text-lg font-semibold text-rose-700";
  heading.textContent = "測定データを削除";
  const description = document.createElement("p");
  description.className = "mt-2 text-sm leading-6 text-stone-600";
  description.textContent = "この植物に記録されたすべての測定データを削除します。選択中の種類や期間だけを削除することはできません。";
  const button = document.createElement("button");
  button.className = "mt-5 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600";
  button.textContent = "すべての測定データを削除";
  button.addEventListener("click", () => {
    deleteMessage.textContent = `${data.plant.name}の測定データ ${count}件をすべて削除します。この操作は取り消せません。`;
    deleteDialog.showModal();
  });
  section.append(heading, description, button);
  return section;
}

function render(data = currentData) {
  if (!data) return;
  const selected = metricTypes.find((type) => type.metric_type === selectedType);
  if (!selected) {
    content.replaceChildren(listStateCard("この植物には計測データがありません。"));
    return;
  }
  plantName.textContent = `${data.plant?.name ?? "植物"} / ${metricLabel(selectedType)}`;
  const title = document.querySelector("h1");
  title.textContent = metricLabel(selectedType);
  const sections = [createControls(), createSummary(selected), createChart(data.metrics, selectedType), createHistory(data.metrics, selectedType)];
  const deleteSection = createDeleteSection(data);
  if (deleteSection) sections.push(deleteSection);
  content.replaceChildren(...sections);
}

async function refresh({ preserveFeedback = false } = {}) {
  if (!plantId) {
    content.replaceChildren(listStateCard("植物が見つかりません。", { error: true }));
    return;
  }
  content.replaceChildren(listStateCard("計測データを読み込んでいます…"));
  if (!preserveFeedback) feedback.className = "mt-6 hidden text-sm";
  rangeWindow = selectedRange === "recent" ? null : (() => {
    const to = new Date();
    return { from: new Date(to.getTime() - Number(selectedRange) * 24 * 60 * 60 * 1000).toISOString(), to: to.toISOString() };
  })();
  try {
    const metadata = await requestJson(rawEndpoint(selectedType ?? "soil_moisture"));
    metricTypes = metadata.metricTypes;
    if (!metricTypes.length) {
      plantName.textContent = `${metadata.plant.name} / 計測データ`;
      selectedType = null;
      currentData = null;
      content.replaceChildren(listStateCard("この植物には計測データがありません。"));
      return;
    }
    if (!metricTypes.some((type) => type.metric_type === selectedType)) selectedType = metricTypes[0].metric_type;
    const data = selectedType === metadata.metric_type ? metadata : await loadAllMetrics(selectedType);
    if (selectedType === metadata.metric_type && metadata.nextCursor) {
      const rest = await loadAllMetrics(selectedType);
      data.metrics = rest.metrics;
    }
    currentData = data;
    render();
  } catch (error) {
    content.replaceChildren(listStateCard(error instanceof Error ? error.message : "計測データを読み込めませんでした。", { error: true }));
  }
}

function closeDeleteDialog() {
  deleteDialog.close();
}

document.querySelector("#close-delete-metrics").addEventListener("click", closeDeleteDialog);
document.querySelector("#cancel-delete-metrics").addEventListener("click", closeDeleteDialog);

deleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentData) return;
  deleteSubmitButton.disabled = true;
  deleteSubmitButton.textContent = "削除中…";
  try {
    await requestJson(`/api/plants/${plantId}/metrics`, { method: "DELETE" });
    const name = currentData.plant.name;
    closeDeleteDialog();
    await refresh({ preserveFeedback: true });
    showFeedback(`${name}の測定データを削除しました。`);
  } catch {
    showFeedback("測定データを削除できませんでした。", true);
  } finally {
    deleteSubmitButton.disabled = false;
    deleteSubmitButton.textContent = "すべて削除";
  }
});

document.querySelectorAll(".logout").forEach((button) => button.addEventListener("click", logout));
setupMobileMenu();
void refresh();
