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

  const items = reports.map((report) => {
    const article = document.createElement("article");
    article.className = "rounded-3xl border border-leaf-100 bg-white p-7 shadow-sm";
    const date = document.createElement("p");
    date.className = "text-sm font-semibold text-leaf-700";
    date.textContent = formatDate(report.date);
    const content = document.createElement("p");
    content.className = "mt-4 whitespace-pre-wrap leading-8 text-stone-700";
    content.textContent = report.content;
    article.append(date, content);
    return article;
  });
  reportsElement.replaceChildren(...items);
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
