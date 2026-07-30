import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesPage } from "./invoices-page";

const settlement = {
  id: "00000000-0000-4000-8000-000000000901",
  settlementType: "MONTHLY",
  status: "FINALIZED",
  roomId: "00000000-0000-4000-8000-000000000101",
  tenancyId: "00000000-0000-4000-8000-000000000201",
  representativeTenantId: "00000000-0000-4000-8000-000000000301",
  representativeTenantName: "Nguyen Dai Dien",
  utilityReadingId: "00000000-0000-4000-8000-000000000401",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  billingYear: 2026,
  billingMonth: 8,
  occupiedDays: 31,
  daysInMonth: 31,
  rentAmount: "3000000",
  proratedRentAmount: "3000000",
  electricityAmount: "35000",
  waterAmount: "30000",
  totalAmount: "3065000",
  prepaidAppliedAmount: "0",
  carryForwardAmount: "0",
  outstandingAmount: "3065000",
};

const invoice = {
  id: "00000000-0000-4000-8000-000000000902",
  invoiceNumber: "INV-20260831-ABC",
  roomId: settlement.roomId,
  roomCode: "A-101",
  tenancyId: settlement.tenancyId,
  payerTenantId: settlement.representativeTenantId,
  payerTenantName: "Nguyen Dai Dien",
  status: "ISSUED",
  billingPeriodStart: "2026-08-01",
  billingPeriodEnd: "2026-08-31",
  issuedOn: "2026-09-01",
  dueOn: "2026-09-05",
  totalAmount: "3065000",
  paidAmount: "0",
  outstandingAmount: "3065000",
  sourceKey: `settlement:${settlement.id}`,
  notes: null,
  items: [
    {
      id: "item-rent",
      invoiceId: "00000000-0000-4000-8000-000000000902",
      itemType: "RENT",
      description: "Tien phong thang 8/2026",
      quantity: "31",
      unit: "ngay",
      unitPrice: "96774",
      amount: "3000000",
      sortOrder: 10,
      utilityUsage: null,
      utilityUsageSource: null,
    },
    {
      id: "item-electricity",
      invoiceId: "00000000-0000-4000-8000-000000000902",
      itemType: "ELECTRICITY",
      description: "Tiền điện",
      quantity: "17",
      unit: "kWh",
      unitPrice: "3500",
      amount: "59500",
      sortOrder: 20,
      utilityUsage: {
        previous: "125",
        current: "142",
        usage: "17",
        unit: "kWh",
        unitPrice: "3500",
        amount: "59500",
      },
      utilityUsageSource: "INVOICE_SNAPSHOT",
    },
    {
      id: "item-water",
      invoiceId: "00000000-0000-4000-8000-000000000902",
      itemType: "WATER",
      description: "Tiền nước",
      quantity: "4",
      unit: "m3",
      unitPrice: "7500",
      amount: "30000",
      sortOrder: 30,
      utilityUsage: null,
      utilityUsageSource: null,
    },
  ],
};

describe("InvoicesPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/invoices");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "print").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/invoices") && method === "GET") {
        return jsonResponse([invoice]);
      }
      if (url.endsWith("/auth/me") && method === "GET") {
        return jsonResponse({ role: "OWNER" });
      }
      if (url.endsWith(`/invoices/${invoice.id}`) && method === "GET") {
        return jsonResponse(invoice);
      }
      if (url.endsWith("/payments")) {
        return jsonResponse(
          {
            id: "payment-1",
            paymentNumber: "PAY-20260901-ABC",
            amount: "1000000",
            method: "CASH",
            status: "CONFIRMED",
            paidAt: "2026-09-01T00:00:00.000Z",
          },
          201,
        );
      }

      return jsonResponse({ error: { message: "Not found" } }, 404);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows issued invoices without manual creation and records payment", async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    expect(await screen.findAllByText("INV-20260831-ABC")).toHaveLength(3);
    expect(screen.getByText("Tiền phòng tháng 8/2026")).toBeInTheDocument();
    expect(screen.queryByText("96.774 VND")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(
        /Tiền điện, chỉ số cũ 125 kWh, chỉ số mới 142 kWh, đã dùng 17 kWh/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("3.500 VND")).toBeInTheDocument();
    expect(
      screen.getByText("Chưa có đủ chỉ số để đối chiếu"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Tạo hóa đơn/ }),
    ).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/invoices/from-settlement"),
      expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: "In hóa đơn" }));
    expect(window.print).toHaveBeenCalledOnce();

    await waitFor(() => {
      expect(screen.getByLabelText(/Số tiền thu/)).toHaveValue("3065000");
    });
    await user.click(
      screen.getByRole("button", { name: "Ghi nhận thanh toán" }),
    );
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/payments"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("clears the previous detail when an exact invoice deep-link fails", async () => {
    const inaccessibleInvoice = {
      ...invoice,
      id: "00000000-0000-4000-8000-000000000999",
      invoiceNumber: "INV-NOT-AVAILABLE",
    };
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/invoices")) {
        return jsonResponse([invoice, inaccessibleInvoice]);
      }
      if (url.endsWith("/auth/me")) {
        return jsonResponse({ role: "OWNER" });
      }
      if (url.endsWith(`/invoices/${invoice.id}`)) {
        return jsonResponse(invoice);
      }
      return jsonResponse({ error: { message: "Not found" } }, 404);
    });
    const user = userEvent.setup();
    render(<InvoicesPage />);

    expect(
      await screen.findByText("Tiền phòng tháng 8/2026"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /INV-NOT-AVAILABLE/ }));

    expect(
      await screen.findByText("Không tải được chi tiết hóa đơn."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Tiền phòng tháng 8/2026"),
    ).not.toBeInTheDocument();
  });

  it("does not show payment mutation controls to a viewer", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/invoices")) return jsonResponse([invoice]);
      if (url.endsWith("/auth/me")) return jsonResponse({ role: "VIEWER" });
      if (url.endsWith(`/invoices/${invoice.id}`)) return jsonResponse(invoice);
      return jsonResponse({ error: { message: "Not found" } }, 404);
    });

    render(<InvoicesPage />);

    expect(
      await screen.findByText("Tiền phòng tháng 8/2026"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "In hóa đơn" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Số tiền thu/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ghi nhận thanh toán" }),
    ).not.toBeInTheDocument();
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
