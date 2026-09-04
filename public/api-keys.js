import { logout, requestJson } from "./api-client.js";

const form = document.querySelector("#key-form");
const list = document.querySelector("#key-list");
const dialog = document.querySelector("#create-key-dialog");
const nameInput = document.querySelector("#key-name");
const errorElement = document.querySelector("#create-key-error");
const submitButton = document.querySelector("#submit-create-key");
const keyBox = document.querySelector("#new-key");
const keyValue = document.querySelector("#new-key-value");
const copyButton = document.querySelector("#copy-new-key");
const feedback = document.querySelector("#key-feedback");

function showFeedback(text, error = false) {
  feedback.textContent = text;
  feedback.className = error ? "mt-5 text-sm text-rose-700" : "mt-5 text-sm text-leaf-700";
}

function formatDateTime(value) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function keyDetail(key) {
  return `${key.scope} · 作成 ${formatDateTime(key.created_at)}${key.last_used_at ? ` · 最終利用 ${formatDateTime(key.last_used_at)}` : ""}`;
}

function showListMessage(text, error = false) {
  list.replaceChildren();
  const element = document.createElement("p");
  element.className = error
    ? "rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-rose-700 shadow-sm"
    : "rounded-2xl border border-leaf-100 bg-white px-5 py-6 text-center text-stone-500 shadow-sm";
  element.textContent = text;
  list.append(element);
}

function showCreateForm() {
  form.reset();
  form.classList.remove("hidden");
  keyBox.classList.add("hidden");
  errorElement.textContent = "";
  errorElement.classList.add("hidden");
  copyButton.textContent = "キーをコピー";
}

function closeDialog() {
  showCreateForm();
  dialog.close();
}

function render(keys) {
  list.replaceChildren();
  if (!keys.length) {
    showListMessage("まだ API キーはありません。");
    return;
  }

  for (const key of keys) {
    const item = document.createElement("article");
    item.className = "rounded-2xl border border-leaf-100 bg-white p-5 shadow-sm";
    const title = document.createElement("h3");
    title.className = "font-semibold";
    title.textContent = key.name;
    const status = document.createElement("span");
    status.className = key.revoked_at
      ? "ml-2 rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-500"
      : "ml-2 rounded-full bg-leaf-100 px-2 py-1 text-xs font-semibold text-leaf-700";
    status.textContent = key.revoked_at ? "無効" : "有効";
    title.append(status);
    const detail = document.createElement("p");
    detail.className = "mt-2 text-sm text-stone-600";
    detail.textContent = keyDetail(key);
    item.append(title, detail);

    const button = document.createElement("button");
    button.className = "mt-4 text-sm font-semibold text-rose-700 underline underline-offset-4";
    if (key.revoked_at) {
      button.textContent = "削除";
      button.onclick = async () => {
        if (!window.confirm(`「${key.name}」を削除しますか？`)) return;
        try {
          await requestJson(`/api/api-keys/${key.id}`, { method: "DELETE" });
          await load();
          showFeedback(`「${key.name}」を削除しました。`);
        } catch (error) {
          showFeedback(error instanceof Error ? error.message : "API キーを削除できませんでした。", true);
        }
      };
    } else {
      button.textContent = "無効化";
      button.onclick = async () => {
        if (!window.confirm(`「${key.name}」を無効化しますか？`)) return;
        try {
          await requestJson(`/api/api-keys/${key.id}/revoke`, { method: "POST" });
          await load();
          showFeedback(`「${key.name}」を無効化しました。`);
        } catch (error) {
          showFeedback(error instanceof Error ? error.message : "API キーを無効化できませんでした。", true);
        }
      };
    }
    item.append(button);
    list.append(item);
  }
}

async function load() {
  try {
    render((await requestJson("/api/api-keys")).apiKeys);
  } catch (error) {
    showListMessage("API キーを読み込めませんでした。時間をおいてもう一度お試しください。", true);
    showFeedback(error instanceof Error ? error.message : "API キーを読み込めませんでした。", true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    errorElement.textContent = "用途名を入力してください。";
    errorElement.classList.remove("hidden");
    nameInput.focus();
    return;
  }

  submitButton.disabled = true;
  errorElement.classList.add("hidden");
  try {
    const result = await requestJson("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: new FormData(form).get("scope") }),
    });
    keyValue.textContent = result.key;
    form.classList.add("hidden");
    keyBox.classList.remove("hidden");
    await load();
    showFeedback("新しい API キーを発行しました。安全な場所にコピーしてください。");
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : "API キーを発行できませんでした。";
    errorElement.classList.remove("hidden");
  } finally {
    submitButton.disabled = false;
  }
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(keyValue.textContent);
    copyButton.textContent = "コピーしました";
    showFeedback("API キーをコピーしました。");
  } catch {
    showFeedback("コピーできませんでした。キーを選択してコピーしてください。", true);
  }
});

document.querySelector("#open-create-key").addEventListener("click", () => {
  showCreateForm();
  dialog.showModal();
  nameInput.focus();
});
document.querySelector("#close-create-key").addEventListener("click", closeDialog);
document.querySelector("#cancel-create-key").addEventListener("click", closeDialog);
document.querySelector("#close-issued-key").addEventListener("click", closeDialog);

document.querySelectorAll(".logout").forEach((button) => button.addEventListener("click", logout));

void load();
