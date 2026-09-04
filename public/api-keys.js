import { logout, requestJson } from "./api-client.js";
import { formatDateTime, replaceWithListState } from "./ui.js";

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
const confirmDialog = document.querySelector("#confirm-key-dialog");
const confirmForm = document.querySelector("#confirm-key-form");
const confirmTitle = document.querySelector("#confirm-key-title");
const confirmMessage = document.querySelector("#confirm-key-message");
const confirmSubmit = document.querySelector("#submit-confirm-key");
let pendingAction = null;

function showFeedback(text, error = false) {
  feedback.textContent = text;
  feedback.className = error ? "mt-5 text-sm text-rose-700" : "mt-5 text-sm text-leaf-700";
}

function keyDetail(key) {
  return `${key.scope} · 作成 ${formatDateTime(key.created_at)}${key.last_used_at ? ` · 最終利用 ${formatDateTime(key.last_used_at)}` : ""}`;
}

function showListMessage(text, error = false) {
  replaceWithListState(list, text, { error });
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
        openConfirmation({ title: "APIキーを削除", message: `「${key.name}」を削除しますか？この操作は取り消せません。`, label: "削除する", run: () => requestJson(`/api/api-keys/${key.id}`, { method: "DELETE" }), success: `「${key.name}」を削除しました。`, failure: "API キーを削除できませんでした。" });
      };
    } else {
      button.textContent = "無効化";
      button.onclick = async () => {
        openConfirmation({ title: "APIキーを無効化", message: `「${key.name}」を無効化しますか？`, label: "無効化する", run: () => requestJson(`/api/api-keys/${key.id}/revoke`, { method: "POST" }), success: `「${key.name}」を無効化しました。`, failure: "API キーを無効化できませんでした。" });
      };
    }
    item.append(button);
    list.append(item);
  }
}

function openConfirmation(action) {
  pendingAction = action;
  confirmTitle.textContent = action.title;
  confirmMessage.textContent = action.message;
  confirmSubmit.textContent = action.label;
  confirmDialog.showModal();
}

function closeConfirmation() {
  pendingAction = null;
  confirmDialog.close();
}

document.querySelector("#close-confirm-key").addEventListener("click", closeConfirmation);
document.querySelector("#cancel-confirm-key").addEventListener("click", closeConfirmation);

confirmForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingAction) return;
  const action = pendingAction;
  confirmSubmit.disabled = true;
  confirmSubmit.textContent = "処理中…";
  try {
    await action.run();
    closeConfirmation();
    await load();
    showFeedback(action.success);
  } catch {
    showFeedback(action.failure, true);
  } finally {
    confirmSubmit.disabled = false;
    confirmSubmit.textContent = action.label;
  }
});

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
