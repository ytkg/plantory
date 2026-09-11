import { requestJson } from "./api-client.js";

const form = document.querySelector("#metrics-settings-form");
const fields = document.querySelector("#settings-fields");
const interval = document.querySelector("#interval-hours");
const current = document.querySelector("#current-interval");
const save = document.querySelector("#save-settings");
const retry = document.querySelector("#retry-load");
const feedback = document.querySelector("#settings-feedback");

function showFeedback(message, error = false) {
  feedback.textContent = message;
  feedback.className = `mt-4 text-sm ${error ? "text-rose-700" : "text-leaf-700"}`;
}

function showSettings(settings) {
  interval.value = String(settings.interval_hours);
  current.textContent = `保存済みの設定：${settings.interval_hours}時間おき`;
}

async function load() {
  fields.disabled = true;
  retry.classList.add("hidden");
  current.textContent = "設定を読み込んでいます…";
  showFeedback("");
  try {
    showSettings(await requestJson("/api/settings/metrics"));
    fields.disabled = false;
  } catch {
    current.textContent = "設定を読み込めませんでした。";
    retry.classList.remove("hidden");
    showFeedback("時間をおいて再読み込みしてください。", true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (fields.disabled) return;
  fields.disabled = true;
  save.textContent = "保存中…";
  showFeedback("");
  try {
    showSettings(await requestJson("/api/settings/metrics", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval_hours: Number(interval.value) }),
    }));
    showFeedback("保存しました。各センサーが次の正時に設定を取得すると反映されます。");
  } catch {
    showFeedback("保存できませんでした。時間をおいてもう一度お試しください。", true);
  } finally {
    fields.disabled = false;
    save.textContent = "保存する";
  }
});

retry.addEventListener("click", load);
load();
