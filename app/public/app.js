const plantsElement = document.querySelector("#plants");
const plantCountElement = document.querySelector("#plant-count");

function formatCount(count) {
  return `${count} 鉢`;
}

function showMessage(message, tone = "muted") {
  plantsElement.replaceChildren();

  const element = document.createElement("p");
  element.className =
    tone === "error"
      ? "rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-rose-700 shadow-sm"
      : "rounded-2xl border border-leaf-100 bg-white px-5 py-6 text-center text-stone-500 shadow-sm";
  element.textContent = message;
  plantsElement.append(element);
}

function showPlants(plants) {
  plantsElement.replaceChildren();
  plantCountElement.textContent = formatCount(plants.length);

  if (plants.length === 0) {
    showMessage("まだ植物が登録されていません。");
    return;
  }

  for (const plant of plants) {
    const article = document.createElement("article");
    article.className =
      "group flex items-center gap-4 rounded-2xl border border-leaf-100 bg-white px-5 py-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md";

    const icon = document.createElement("span");
    icon.className = "flex size-11 shrink-0 items-center justify-center rounded-xl bg-leaf-100 text-xl";
    icon.textContent = "🪴";

    const name = document.createElement("h3");
    name.className = "text-base font-semibold text-ink";
    name.textContent = plant.name;

    article.append(icon, name);
    plantsElement.append(article);
  }
}

async function loadPlants() {
  try {
    const response = await fetch("/api/plants");
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const data = await response.json();
    showPlants(data.plants);
  } catch (error) {
    console.error("Could not load plants", error);
    plantCountElement.textContent = "—";
    showMessage("植物を読み込めませんでした。時間をおいてもう一度お試しください。", "error");
  }
}

void loadPlants();
