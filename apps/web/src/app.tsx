import { AppShell } from "./components/app-shell";
import { LoginPanel } from "./components/login-panel";
import { DashboardPage } from "./dashboard/dashboard-page";
import { DebtsPage } from "./debts/debts-page";
import { InvoicesPage } from "./invoices/invoices-page";
import { PricingPage } from "./pricing/pricing-page";
import { ReportsPage } from "./reports/reports-page";
import { RoomsPage } from "./rooms/rooms-page";
import { TenantsPage } from "./tenants/tenants-page";
import { UtilitiesPage } from "./utilities/utilities-page";

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
      ) : path === "/utilities" ? (
        <UtilitiesPage />
      ) : path === "/invoices" ? (
        <InvoicesPage />
      ) : path === "/debts" ? (
        <DebtsPage />
      ) : path === "/settings" ? (
        <PricingPage />
      ) : path === "/reports" ? (
        <ReportsPage />
      ) : (
        <DashboardPage />
      )}
    </AppShell>
  );
}
