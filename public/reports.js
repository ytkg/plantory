const reportsElement = document.querySelector("#reports");

function formatDate(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

function message(text, error = false) {
  reportsElement.replaceChildren();
  const element = document.createElement("p");
  element.className = error
    ? "rounded-3xl border border-rose-200 bg-rose-50 p-7 text-rose-700"
    : "rounded-3xl border border-dashed border-leaf-100 bg-white/70 p-7 text-center text-stone-500";
  element.textContent = text;
  reportsElement.append(element);
}

function showReports(reports) {
  if (reports.length === 0) {
    message("まだ観察日記はありません。最初の記録を待っています。");
    return;
  }

  const createReport = (report, featured = false) => {
    const article = document.createElement("article");
    article.className = featured
      ? "rounded-3xl border border-leaf-100 bg-white p-7 shadow-sm sm:p-8"
      : "rounded-3xl border border-leaf-100 bg-white p-6 shadow-sm";
    const date = document.createElement("p");
    date.className = "text-sm font-semibold text-leaf-700";
    date.textContent = formatDate(report.date);
    const content = document.createElement("p");
    content.className = featured
      ? "mt-4 whitespace-pre-wrap text-lg leading-8 text-stone-700"
      : "mt-3 whitespace-pre-wrap leading-7 text-stone-700";
    content.textContent = report.content;
    article.append(date, content);
    return article;
  };

  const latest = document.createElement("section");
  const latestHeading = document.createElement("h2");
  latestHeading.className = "text-sm font-semibold tracking-[0.12em] text-leaf-700";
  latestHeading.textContent = "最新の観察";
  latest.append(latestHeading, createReport(reports[0], true));
  latest.lastElementChild.classList.add("mt-3");

  if (reports.length === 1) {
    reportsElement.replaceChildren(latest);
    return;
  }

  const history = document.createElement("section");
  history.className = "mt-8";
  const historyHeading = document.createElement("h2");
  historyHeading.className = "text-sm font-semibold tracking-[0.12em] text-stone-600";
  historyHeading.textContent = "これまでの記録";
  const items = document.createElement("div");
  items.className = "mt-3 grid gap-3";
  items.append(...reports.slice(1).map((report) => createReport(report)));
  history.append(historyHeading, items);
  reportsElement.replaceChildren(latest, history);
}

async function loadReports() {
  try {
    const response = await fetch("/api/reports");
    if (!response.ok) throw new Error();
    showReports((await response.json()).reports);
  } catch {
    message("観察日記を読み込めませんでした。時間をおいてもう一度お試しください。", true);
  }
}

void loadReports();
