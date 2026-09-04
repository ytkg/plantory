export function formatDateTime(value) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function listStateCard(text, { error = false } = {}) {
  const element = document.createElement("p");
  element.className = error
    ? "rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-rose-700 shadow-sm"
    : "rounded-2xl border border-leaf-100 bg-white px-5 py-6 text-center text-stone-500 shadow-sm";
  element.textContent = text;
  return element;
}

export function replaceWithListState(container, text, options) {
  container.replaceChildren(listStateCard(text, options));
}

export function setupMobileMenu() {
  const menu = document.querySelector("header details");
  if (!menu) return;
  document.addEventListener("click", (event) => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
}
