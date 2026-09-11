const form = document.querySelector("#login-form");
const errorElement = document.querySelector("#login-error");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorElement.classList.add("hidden");
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    if (!response.ok) throw new Error((await response.json()).error ?? "ログインできませんでした。");
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.assign(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : "ログインできませんでした。";
    errorElement.classList.remove("hidden");
  } finally { button.disabled = false; }
});
