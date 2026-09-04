import { logout, requestJson } from "./api-client.js";

const form = document.querySelector("#key-form");
const list = document.querySelector("#key-list");
const keyBox = document.querySelector("#new-key");
const keyValue = document.querySelector("#new-key-value");

function keyDetail(key) {
  return `${key.scope} · 作成 ${key.created_at}${key.last_used_at ? ` · 最終利用 ${key.last_used_at}` : ""}${key.revoked_at ? " · 無効" : ""}`;
}

function render(keys) {
  list.replaceChildren();
  if (!keys.length) {
    list.textContent = "まだ API キーはありません。";
    return;
  }

  for (const key of keys) {
    const item = document.createElement("article");
    item.className = "rounded-2xl border border-leaf-100 bg-white p-5 shadow-sm";
    const title = document.createElement("h3");
    title.className = "font-semibold";
    title.textContent = key.name;
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
        await requestJson(`/api/api-keys/${key.id}`, { method: "DELETE" });
        await load();
      };
    } else {
      button.textContent = "無効化";
      button.onclick = async () => {
        if (!window.confirm(`「${key.name}」を無効化しますか？`)) return;
        await requestJson(`/api/api-keys/${key.id}/revoke`, { method: "POST" });
        await load();
      };
    }
    item.append(button);
    list.append(item);
  }
}

async function load() {
  render((await requestJson("/api/api-keys")).apiKeys);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await requestJson("/api/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(new FormData(form))),
  });
  keyValue.textContent = result.key;
  keyBox.classList.remove("hidden");
  form.reset();
  await load();
});

document.querySelector("#logout").addEventListener("click", logout);

void load();
