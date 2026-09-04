const plantsElement = document.querySelector("#plants");
const plantCountElement = document.querySelector("#plant-count");
const dialog = document.querySelector("#create-plant-dialog");
const form = document.querySelector("#create-plant-form");
const nameInput = document.querySelector("#plant-name");
const errorElement = document.querySelector("#create-plant-error");
const submitButton = document.querySelector("#submit-create-plant");

function showMessage(message, error = false) {
  plantsElement.replaceChildren();
  const element = document.createElement("p");
  element.className = error ? "rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-rose-700" : "rounded-2xl border border-dashed border-leaf-100 bg-white/70 px-5 py-10 text-center text-stone-500";
  element.textContent = message;
  plantsElement.append(element);
}

function redirectToLogin() {
  window.location.assign("/login?next=/plants");
}

async function loadPlants() {
  try {
    const response = await fetch("/api/plants");
    if (response.status === 401) return redirectToLogin();
    if (!response.ok) throw new Error();
    const { plants } = await response.json();
    plantCountElement.textContent = `${plants.length} 鉢`;
    if (!plants.length) return showMessage("まだ植物が登録されていません。");
    plantsElement.replaceChildren(...plants.map((plant) => {
      const item = document.createElement("article");
      item.className = "flex items-center gap-4 rounded-2xl border border-leaf-100 bg-white px-5 py-5 shadow-sm";
      item.innerHTML = '<span class="flex size-11 items-center justify-center rounded-xl bg-leaf-100 text-xl">🪴</span>';
      const name = document.createElement("h3");
      name.className = "text-base font-semibold";
      name.textContent = plant.name;
      item.append(name);
      return item;
    }));
  } catch {
    plantCountElement.textContent = "—";
    showMessage("植物を読み込めませんでした。", true);
  }
}

function closeDialog() {
  form.reset();
  errorElement.textContent = "";
  errorElement.classList.add("hidden");
  dialog.close();
}

document.querySelector("#open-create-plant").addEventListener("click", () => {
  form.reset();
  errorElement.textContent = "";
  errorElement.classList.add("hidden");
  dialog.showModal();
  nameInput.focus();
});

document.querySelector("#close-create-plant").addEventListener("click", closeDialog);
document.querySelector("#cancel-create-plant").addEventListener("click", closeDialog);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    errorElement.textContent = "植物の名前を入力してください。";
    errorElement.classList.remove("hidden");
    nameInput.focus();
    return;
  }

  submitButton.disabled = true;
  errorElement.classList.add("hidden");
  try {
    const response = await fetch("/api/plants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.status === 401) return redirectToLogin();
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "植物を追加できませんでした。");
    }
    closeDialog();
    await loadPlants();
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : "植物を追加できませんでした。";
    errorElement.classList.remove("hidden");
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#logout").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.assign("/");
});

void loadPlants();
