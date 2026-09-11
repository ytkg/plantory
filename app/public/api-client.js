function loginUrl() {
  const next = `${window.location.pathname}${window.location.search}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

export async function requestJson(path, init = {}) {
  const response = await fetch(path, init);
  if (response.status === 401) {
    window.location.assign(loginUrl());
    throw new Error("Authentication is required.");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "リクエストに失敗しました。");
  }
  return body;
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.assign("/");
}
