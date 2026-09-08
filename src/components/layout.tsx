import type { PropsWithChildren } from "hono/jsx";

const headerClass = "fixed inset-x-0 top-0 z-10 border-b border-leaf-100/80 bg-white/80 backdrop-blur";
const shellClass = "mx-auto flex h-16 max-w-2xl items-center gap-4 px-5 sm:px-8";

function Brand({ management = false }: { management?: boolean }) {
  return <a class={`${management ? "mr-auto " : ""}text-sm font-semibold tracking-[0.2em] text-leaf-700`} href="/">PLANTORY</a>;
}

const managementLinks = [["/", "観察日記"], ["/plants", "植物一覧"], ["/settings/api-keys", "APIキー管理"]] as const;

function ManagementLink({ path, label, active, mobile = false }: { path: string; label: string; active: string; mobile?: boolean }) {
  const current = active === path;
  const className = mobile
    ? `rounded-xl ${current ? "bg-leaf-50 text-leaf-700" : "text-stone-600 hover:bg-leaf-50"} px-4 py-3 text-sm font-semibold`
    : `text-sm font-semibold ${current ? "text-leaf-700 underline underline-offset-4" : "text-stone-600"}`;
  return <a class={className} href={path} aria-current={current ? "page" : undefined}>{label}</a>;
}

export function ManagementHeader({ active }: { active: string }) {
  return <header class={headerClass}><div class={shellClass}>
    <Brand management />
    <nav class="hidden items-center gap-4 sm:flex" aria-label="管理ナビゲーション">
      {managementLinks.map(([path, label]) => <ManagementLink path={path} label={label} active={active} />)}
    </nav>
    <button class="logout hidden text-sm font-semibold text-leaf-700 sm:block">ログアウト</button>
    <details class="relative sm:hidden">
      <summary class="mobile-menu-toggle flex size-11 cursor-pointer list-none items-center justify-center rounded-xl bg-leaf-100 text-xl leading-none text-leaf-700" aria-label="メニューを開く"><span aria-hidden="true">☰</span></summary>
      <nav class="absolute right-0 top-12 z-20 grid w-52 gap-1 rounded-2xl border border-leaf-100 bg-white p-2 shadow-xl" aria-label="管理メニュー">
        {managementLinks.map(([path, label]) => <ManagementLink path={path} label={label} active={active} mobile />)}
        <button class="logout rounded-xl px-4 py-3 text-left text-sm font-semibold text-leaf-700 hover:bg-leaf-50">ログアウト</button>
      </nav>
    </details>
  </div></header>;
}

export function PublicHeader({ loginPage = false }: { loginPage?: boolean }) {
  return <header class={headerClass}><div class={`${shellClass} justify-between`}>
    <Brand />
    <nav class="flex items-center gap-4" aria-label="公開ナビゲーション">
      <a class={`text-sm font-semibold text-leaf-700${loginPage ? "" : " underline underline-offset-4"}`} href="/" aria-current={loginPage ? undefined : "page"}>観察日記</a>
      {!loginPage && <a class="text-sm font-semibold text-leaf-700" href="/login">ログイン</a>}
    </nav>
  </div></header>;
}

export function Footer() {
  return <footer class="border-t border-leaf-100/80 py-3 text-center text-sm text-stone-500">© 2026 Plantory</footer>;
}

export function Layout({ title, themeColor, children }: PropsWithChildren<{ title: string; themeColor?: string }>) {
  return <html lang="ja"><head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    {themeColor && <meta name="theme-color" content={themeColor} />}
    <title>{`Plantory | ${title}`}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head><body class="flex min-h-screen flex-col bg-leaf-50 text-ink antialiased">{children}</body></html>;
}
