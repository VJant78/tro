import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@repo/ui";
import { apiFetch, messageFor } from "../api";

const navItems = [
  { label: "Tổng quan", shortLabel: "Tổng quan", href: "/", icon: "⌂" },
  { label: "Phòng", shortLabel: "Phòng", href: "/rooms", icon: "▦" },
  {
    label: "Người thuê",
    shortLabel: "Người thuê",
    href: "/tenants",
    icon: "♙",
  },
  {
    label: "Chốt tiền",
    shortLabel: "Chốt tiền",
    href: "/utilities",
    icon: "✓",
  },
  { label: "Hóa đơn", shortLabel: "Hóa đơn", href: "/invoices", icon: "▤" },
  { label: "Công nợ", shortLabel: "Công nợ", href: "/debts", icon: "₫" },
  { label: "Báo cáo", shortLabel: "Báo cáo", href: "/reports", icon: "▥" },
  { label: "Cài đặt", shortLabel: "Cài đặt", href: "/settings", icon: "⚙" },
] as const;

const mobilePrimary = new Set(["/", "/rooms", "/utilities", "/debts"]);

export function AppShell({ children }: { children: ReactNode }) {
  const currentPath = window.location.pathname;
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMoreOpen) return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      "a, button:not([disabled])",
    );
    focusable?.[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMoreOpen(false);
        moreButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMoreOpen]);

  async function logout() {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
      window.location.replace("/login");
    } catch (error) {
      setLogoutError(
        messageFor(error, "Không thể đăng xuất. Vui lòng thử lại."),
      );
      setIsLoggingOut(false);
    }
  }

  const secondaryItems = navItems.filter(
    (item) => !mobilePrimary.has(item.href),
  );
  const isSecondaryActive = secondaryItems.some(
    (item) => item.href === currentPath,
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Chuyển đến nội dung chính
      </a>
      <aside className="sidebar" aria-label="Điều hướng chính">
        <div className="sidebar-title">Quản lý trọ</div>
        <nav>
          {navItems.map((item) => (
            <NavLink currentPath={currentPath} item={item} key={item.href} />
          ))}
        </nav>
        <div className="sidebar-account">
          <strong>Chủ trọ</strong>
          <Button
            disabled={isLoggingOut}
            onClick={() => void logout()}
            variant="secondary"
          >
            {isLoggingOut ? "Đang đăng xuất" : "Đăng xuất"}
          </Button>
          {logoutError ? <small role="alert">{logoutError}</small> : null}
        </div>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <strong>Quản lý nhà trọ</strong>
          <span>Asia/Ho_Chi_Minh · VND</span>
        </header>
        <section className="content">{children}</section>
      </main>

      <nav className="mobile-nav" aria-label="Điều hướng chính trên điện thoại">
        {navItems
          .filter((item) => mobilePrimary.has(item.href))
          .map((item) => (
            <NavLink
              currentPath={currentPath}
              item={item}
              key={item.href}
              mobile
            />
          ))}
        <button
          aria-expanded={isMoreOpen}
          aria-haspopup="dialog"
          className="mobile-nav-link"
          data-active={isSecondaryActive || isMoreOpen}
          onClick={() => setIsMoreOpen(true)}
          ref={moreButtonRef}
          type="button"
        >
          <span aria-hidden="true">•••</span>
          <small>Thêm</small>
        </button>
      </nav>

      {isMoreOpen ? (
        <div
          className="drawer-backdrop"
          onMouseDown={() => setIsMoreOpen(false)}
        >
          <div
            aria-labelledby="more-menu-title"
            aria-modal="true"
            className="mobile-drawer"
            onMouseDown={(event) => event.stopPropagation()}
            ref={drawerRef}
            role="dialog"
          >
            <div className="section-heading">
              <h2 id="more-menu-title">Thêm</h2>
              <button
                aria-label="Đóng menu"
                className="icon-button"
                onClick={() => setIsMoreOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <nav>
              {secondaryItems.map((item) => (
                <NavLink
                  currentPath={currentPath}
                  item={item}
                  key={item.href}
                />
              ))}
            </nav>
            <Button
              disabled={isLoggingOut}
              onClick={() => void logout()}
              variant="secondary"
            >
              {isLoggingOut ? "Đang đăng xuất" : "Đăng xuất"}
            </Button>
            {logoutError ? (
              <div className="notice error" role="alert">
                {logoutError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NavLink({
  currentPath,
  item,
  mobile = false,
}: {
  currentPath: string;
  item: (typeof navItems)[number];
  mobile?: boolean;
}) {
  return (
    <a
      aria-current={item.href === currentPath ? "page" : undefined}
      className={mobile ? "mobile-nav-link" : undefined}
      href={item.href}
    >
      <span aria-hidden="true">{item.icon}</span>
      {mobile ? <small>{item.shortLabel}</small> : <span>{item.label}</span>}
    </a>
  );
}
