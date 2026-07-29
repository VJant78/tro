import type { ReactNode } from "react";

const navItems = [
  ["Dashboard", "/"],
  ["Phong", "/rooms"],
  ["Nguoi thue", "/tenants"],
  ["Dien nuoc", "/utilities"],
  ["Hoa don", "/invoices"],
  ["Cong no", "/debts"],
  ["Bao cao", "/reports"],
  ["Cai dat", "/settings"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const currentPath = window.location.pathname;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Dieu huong chinh">
        <div className="sidebar-title">Tro Manager</div>
        <nav>
          {navItems.map(([label, href]) => (
            <a
              aria-current={href === currentPath ? "page" : undefined}
              href={href}
              key={href}
            >
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <strong>Chu tro</strong>
          <span>Asia/Ho_Chi_Minh · VND</span>
        </header>
        <section className="content">{children}</section>
      </main>
    </div>
  );
}
