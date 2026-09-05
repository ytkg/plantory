const statusSection = document.querySelector("#plant-status");
const statusCards = document.querySelector("#plant-status-cards");

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

    valueRow.append(label, value);
    progress.append(bar);
    card.append(name, valueRow, progress);
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
