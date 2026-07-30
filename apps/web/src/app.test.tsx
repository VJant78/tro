import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./app";

describe("App", () => {
  it("renders the dashboard shell", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          asOf: "2026-07-30",
          billingYear: 2026,
          billingMonth: 7,
          totals: {
            rooms: 0,
            occupiedRooms: 0,
            currentMonthCollectable: "0",
            currentMonthCollected: "0",
            currentMonthOutstanding: "0",
            overdueInvoiceCount: 0,
            overdueAmount: "0",
          },
          needsAttention: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    window.history.pushState({}, "", "/");
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Tro Manager")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("routes to the rooms module shell", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          page: { limit: 50, nextCursor: null, hasMore: false },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    window.history.pushState({}, "", "/rooms");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Phong" }),
    ).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("routes to the tenants module shell", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          page: { limit: 50, nextCursor: null, hasMore: false },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    window.history.pushState({}, "", "/tenants");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Nguoi thue" }),
    ).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("routes to pricing settings", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "pricing-1",
          scope: "SYSTEM",
          propertyId: null,
          roomId: null,
          tenancyId: null,
          rentAmount: null,
          electricityUnitPrice: "3500",
          waterUnitPrice: "15000",
          trashFee: "30000",
          internetFee: "100000",
          serviceFee: "0",
          utilityClosingDay: 28,
          dueDay: 5,
          currencyCode: "VND",
          timezone: "Asia/Ho_Chi_Minh",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          isActive: true,
          notes: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Cau hinh" }),
    ).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("routes to utilities", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/rooms?")) {
        return new Response(
          JSON.stringify({
            data: [],
            page: { limit: 100, nextCursor: null, hasMore: false },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    window.history.pushState({}, "", "/utilities");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Dien nuoc" }),
    ).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("routes to reports", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          billingYear: 2026,
          billingMonth: 7,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-31",
          totals: {
            invoiceTotal: "0",
            collected: "0",
            outstanding: "0",
            overdue: "0",
            electricity: "0",
            water: "0",
          },
          invoices: [],
          payments: [],
          debts: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    window.history.pushState({}, "", "/reports");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Bao cao" }),
    ).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
