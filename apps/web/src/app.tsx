import { StatusBadge } from "@repo/ui";
import { AppShell } from "./components/app-shell";
import { LoginPanel } from "./components/login-panel";
import { PricingPage } from "./pricing/pricing-page";
import { RoomsPage } from "./rooms/rooms-page";
import { TenantsPage } from "./tenants/tenants-page";

const metrics = [
  ["Tong phong", "0"],
  ["Dang thue", "0"],
  ["Tong cong no", "0 VND"],
  ["Hoa don qua han", "0"],
] as const;

export function App() {
  const path = window.location.pathname;
  const isLoginPath = path === "/login";

  if (isLoginPath) {
    return (
      <main className="login-shell">
        <LoginPanel />
      </main>
    );
  }

  return (
    <AppShell>
      {path === "/rooms" ? (
        <RoomsPage />
      ) : path === "/tenants" ? (
        <TenantsPage />
      ) : path === "/settings" ? (
        <PricingPage />
      ) : (
        <>
          <h1>Dashboard</h1>
          <div className="metric-grid">
            {metrics.map(([label, value]) => (
              <article className="metric" key={label}>
                <div className="metric-label">{label}</div>
                <div className="metric-value">{value}</div>
              </article>
            ))}
          </div>
          <section className="panel" aria-labelledby="foundation-status">
            <h2 id="foundation-status">Nen tang Phase 2</h2>
            <p>
              <StatusBadge tone="success">San sang</StatusBadge>
            </p>
            <p>
              Giao dien hien tai la app shell va skeleton de cac module phong,
              nguoi thue, hoa don va thanh toan duoc trien khai o cac phase sau.
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}
