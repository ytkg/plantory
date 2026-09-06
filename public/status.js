const statusSection = document.querySelector("#plant-status");
const statusCards = document.querySelector("#plant-status-cards");

function relativeRecordedAt(value) {
  if (typeof value !== "string") return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const recordedAt = new Date(normalized);
  if (Number.isNaN(recordedAt.valueOf())) return null;

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - recordedAt.valueOf()) / 60000));
  if (elapsedMinutes < 1) return "たった今";
  if (elapsedMinutes < 60) return `${elapsedMinutes}分前`;
  if (elapsedMinutes < 1440) return `${Math.floor(elapsedMinutes / 60)}時間前`;
  return `${Math.floor(elapsedMinutes / 1440)}日前`;
}

function showStatuses(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return;

  statusCards.replaceChildren();
  for (const status of statuses) {
    const moisture = Number(status.moisture);
    if (!Number.isFinite(moisture)) continue;

    const card = document.createElement("article");
    card.className = "rounded-2xl border border-leaf-100 bg-white p-4 shadow-sm";

    const name = document.createElement("h3");
    name.className = "truncate text-sm font-semibold text-ink";
    name.textContent = status.name;

    const valueRow = document.createElement("div");
    valueRow.className = "mt-3 flex items-baseline justify-between gap-2";

    const label = document.createElement("span");
    label.className = "text-xs text-stone-500";
    label.textContent = "水分量";

    const value = document.createElement("span");
    value.className = "text-xl font-semibold text-leaf-700";
    value.textContent = `${moisture}%`;

    const progress = document.createElement("div");
    progress.className = "mt-3 h-2 overflow-hidden rounded-full bg-leaf-100";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", `${status.name}の水分量`);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", String(moisture));

    const bar = document.createElement("div");
    bar.className = "h-full rounded-full bg-leaf-500";
    bar.style.width = `${moisture}%`;

    const relativeTime = relativeRecordedAt(status.recorded_at);
    const recordedAt = document.createElement("p");
    recordedAt.className = "mt-3 text-xs text-stone-500";
    recordedAt.textContent = relativeTime ? `最終計測 ${relativeTime}` : "最終計測 --";

    valueRow.append(label, value);
    progress.append(bar);
    card.append(name, valueRow, progress, recordedAt);
    statusCards.append(card);
  }

  if (statusCards.childElementCount > 0) statusSection.classList.remove("hidden");
}

async function loadStatuses() {
  try {
    const response = await fetch("/api/status");
    if (!response.ok) return;
    showStatuses(await response.json());
  } catch {
    // Public status is optional; keep the rest of the page available.
  }
}

void loadStatuses();
