import { readFile, writeFile } from "node:fs/promises";

const headerClass = "fixed inset-x-0 top-0 z-10 border-b border-leaf-100/80 bg-white/80 backdrop-blur";
const shellClass = "mx-auto flex h-16 max-w-2xl items-center gap-4 px-5 sm:px-8";
const brand = '<a class="mr-auto text-sm font-semibold tracking-[0.2em] text-leaf-700" href="/">PLANTORY</a>';

function managementLink(path, label, active) {
  const current = active === path;
  return `<a class="text-sm font-semibold ${current ? "text-leaf-700 underline underline-offset-4" : "text-stone-600"}" href="${path}"${current ? ' aria-current="page"' : ""}>${label}</a>`;
}

function mobileManagementLink(path, label, active) {
  const current = active === path;
  return `<a class="rounded-xl ${current ? "bg-leaf-50 text-leaf-700" : "text-stone-600 hover:bg-leaf-50"} px-4 py-3 text-sm font-semibold" href="${path}"${current ? ' aria-current="page"' : ""}>${label}</a>`;
}

function managementHeader(active) {
  const links = [
    ["/", "観察日記"],
    ["/plants", "植物一覧"],
    ["/settings/api-keys", "API キー管理"],
  ];
  return `<header class="${headerClass}"><div class="${shellClass}">${brand}<nav class="hidden items-center gap-4 sm:flex" aria-label="管理ナビゲーション">${links.map(([path, label]) => managementLink(path, label, active)).join("")}</nav><button class="logout hidden text-sm font-semibold text-leaf-700 sm:block">ログアウト</button><details class="relative sm:hidden"><summary class="flex size-11 list-none items-center justify-center rounded-xl bg-leaf-100 text-xl leading-none text-leaf-700" aria-label="メニューを開く"><span aria-hidden="true">☰</span></summary><nav class="absolute right-0 top-12 z-20 grid w-52 gap-1 rounded-2xl border border-leaf-100 bg-white p-2 shadow-xl" aria-label="管理メニュー">${links.map(([path, label]) => mobileManagementLink(path, label, active)).join("")}<button class="logout rounded-xl px-4 py-3 text-left text-sm font-semibold text-leaf-700 hover:bg-leaf-50">ログアウト</button></nav></details></div></header>`;
}

function publicHeader({ loginPage = false } = {}) {
  const observation = `<a class="text-sm font-semibold text-leaf-700${loginPage ? "" : " underline underline-offset-4"}" href="/"${loginPage ? "" : ' aria-current="page"'}>観察日記</a>`;
  const login = loginPage ? "" : '<a class="text-sm font-semibold text-leaf-700" href="/login">ログイン</a>';
  return `<header class="${headerClass}"><div class="${shellClass} justify-between">${brand.replace('class="mr-auto ', 'class="')}<nav class="flex items-center gap-4" aria-label="公開ナビゲーション">${observation}${login}</nav></div></header>`;
}

const footer = '<footer class="border-t border-leaf-100/80 py-6 text-center text-sm text-stone-500">© 2026 Plantory</footer>';
const pages = [
  ["public/index.html", publicHeader()],
  ["public/index-authenticated.html", managementHeader("/")],
  ["public/plants.html", managementHeader("/plants")],
  ["public/api-keys.html", managementHeader("/settings/api-keys")],
  ["public/login.html", publicHeader({ loginPage: true })],
];

for (const [path, header] of pages) {
  const html = await readFile(path, "utf8");
  const withHeader = html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/, header);
  const withLayout = withHeader.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/, footer);
  await writeFile(path, withLayout);
}
