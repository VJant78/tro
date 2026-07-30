import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReceiptDialog } from "./receipt-dialog";

const tenancyId = "00000000-0000-4000-8000-000000000201";
const room = {
  id: "00000000-0000-4000-8000-000000000101",
  code: "A-101",
  name: "Phòng A101",
  roomType: null,
  status: "OCCUPIED" as const,
  defaultRentAmount: "2500000",
  defaultBillingCycleType: "MONTHLY" as const,
  defaultBillingCycleCount: 1,
  maxOccupants: 2,
  depositAmount: "500000",
  notes: null,
  currentOccupancy: {
    tenancyId,
    representativeTenantId: "tenant-1",
    representativeName: "Nguyễn Văn A",
    startedOn: "2026-05-01",
    memberCount: 2,
    coTenantCount: 1,
    occupants: [
      {
        tenantId: "tenant-1",
        fullName: "Nguyễn Văn A",
        phone: "0900000001",
        role: "REPRESENTATIVE" as const,
        joinedOn: "2026-05-01",
      },
    ],
  },
};

describe("ReceiptDialog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("previews FIFO allocations and confirms with snapshot and idempotency key", async () => {
    const onCollected = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith(`/tenancies/${tenancyId}/receipts/preview`)) {
        return jsonResponse({
          previewToken: "signed-preview",
          expiresAt: "2026-07-30T13:00:00.000Z",
          allocations: [
            {
              invoiceId: "invoice-may",
              invoiceNumber: "INV-05",
              billingPeriodStart: "2026-05-01",
              billingPeriodEnd: "2026-05-31",
              amount: "300000",
            },
            {
              invoiceId: "invoice-june",
              invoiceNumber: "INV-06",
              billingPeriodStart: "2026-06-01",
              billingPeriodEnd: "2026-06-30",
              amount: "200000",
            },
          ],
          creditCreated: "100000",
          creditBalanceAfter: "100000",
        });
      }
      if (
        url.endsWith(`/tenancies/${tenancyId}/receipts`) &&
        init?.method === "POST"
      ) {
        return jsonResponse({
          receipt: {
            id: "receipt-1",
            receiptNumber: "PT-20260730-0001",
            tenancyId,
            amount: "600000",
            method: "CASH",
            receivedAt: "2026-07-30T12:30:00.000Z",
            status: "CONFIRMED",
          },
          allocations: [
            { invoiceId: "invoice-may", amount: "300000" },
            { invoiceId: "invoice-june", amount: "200000" },
          ],
          creditCreated: "100000",
          creditBalanceAfter: "100000",
          replayed: false,
        });
      }
      if (url.includes(`/tenancies/${tenancyId}/receipts?`)) {
        return jsonResponse({
          data: [],
          page: { limit: 20, nextCursor: null, hasMore: false },
          summary: { creditBalance: "100000", receiptCount: 1 },
        });
      }
      return jsonResponse({ error: { message: "Not found" } }, 404);
    });

    const user = userEvent.setup();
    render(
      <ReceiptDialog
        initialView="collect"
        onClose={vi.fn()}
        onCollected={onCollected}
        room={room}
      />,
    );

    await user.type(screen.getByLabelText("Số tiền"), "600000");
    await user.click(screen.getByRole("button", { name: "Xem phân bổ" }));

    expect(await screen.findByText("INV-05")).toBeInTheDocument();
    expect(screen.getByText("INV-06")).toBeInTheDocument();
    expect(screen.getByText("Thành trả trước")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Xác nhận thu tiền" }));

    await waitFor(() => expect(onCollected).toHaveBeenCalledTimes(1));
    const confirmCall = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith(`/tenancies/${tenancyId}/receipts`) &&
          init?.method === "POST",
      );
    expect(confirmCall?.[1]?.headers).toEqual(
      expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
    );
    expect(JSON.parse(String(confirmCall?.[1]?.body))).toEqual(
      expect.objectContaining({
        amount: "600000",
        previewToken: "signed-preview",
      }),
    );
  });

  it("loads history and receipt detail", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes(`/tenancies/${tenancyId}/receipts?`)) {
        return jsonResponse({
          data: [
            {
              id: "receipt-1",
              receiptNumber: "PT-001",
              tenancyId,
              amount: "30000",
              method: "CASH",
              receivedAt: "2026-07-30T08:00:00.000Z",
              status: "CONFIRMED",
              canVoid: false,
              payerTenantName: "Nguyễn Văn A",
            },
          ],
          page: { limit: 20, nextCursor: null, hasMore: false },
        });
      }
      if (url.endsWith("/receipts/receipt-1")) {
        return jsonResponse({
          receipt: {
            id: "receipt-1",
            receiptNumber: "PT-001",
            tenancyId,
            amount: "30000",
            method: "CASH",
            receivedAt: "2026-07-30T08:00:00.000Z",
            status: "CONFIRMED",
            canVoid: false,
            recordedByName: "Chủ trọ",
          },
          allocations: [],
          creditCreated: "30000",
          creditBalanceAfter: "30000",
          replayed: false,
        });
      }
      return jsonResponse({ error: { message: "Not found" } }, 404);
    });

    const user = userEvent.setup();
    render(
      <ReceiptDialog
        initialView="history"
        onClose={vi.fn()}
        onCollected={vi.fn()}
        room={room}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /PT-001/ }));
    expect(await screen.findByText("Chi tiết PT-001")).toBeInTheDocument();
    expect(screen.getByText("Chuyển thành trả trước")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hủy lần thu" }),
    ).not.toBeInTheDocument();
  });

  it("voids an authorized confirmed receipt and refreshes history and detail", async () => {
    let voided = false;
    let voidAttempts = 0;
    const onCollected = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const receipt = {
        id: "receipt-void",
        receiptNumber: "PT-VOID-001",
        tenancyId,
        amount: "200000",
        method: "CASH",
        receivedAt: "2026-07-30T08:00:00.000Z",
        status: voided ? "VOIDED" : "CONFIRMED",
        canVoid: !voided,
        recordedByName: "Chủ trọ",
        voidedAt: voided ? "2026-07-30T10:00:00.000Z" : null,
        voidReason: voided ? "Nhập nhầm số tiền" : null,
      };
      const detail = {
        receipt,
        allocations: [],
        creditCreated: "200000",
        creditBalanceAfter: voided ? "0" : "200000",
        replayed: false,
        reversal: voided
          ? {
              voidedAt: "2026-07-30T10:00:00.000Z",
              reason: "Nhập nhầm số tiền",
            }
          : null,
      };

      if (url.includes(`/tenancies/${tenancyId}/receipts?`)) {
        return jsonResponse({
          data: [receipt],
          page: { limit: 20, nextCursor: null, hasMore: false },
        });
      }
      if (
        url.endsWith("/receipts/receipt-void/void") &&
        init?.method === "POST"
      ) {
        voidAttempts += 1;
        if (voidAttempts === 1) {
          return jsonResponse(
            {
              error: {
                code: "RECEIPT_REVERSAL_CONFLICT",
                message: "Receipt reversal conflict",
              },
            },
            409,
          );
        }
        voided = true;
        return jsonResponse({
          ...detail,
          receipt: { ...receipt, status: "VOIDED", canVoid: false },
          creditBalanceAfter: "0",
          reversal: {
            voidedAt: "2026-07-30T10:00:00.000Z",
            reason: "Nhập nhầm số tiền",
          },
        });
      }
      if (url.endsWith("/receipts/receipt-void")) {
        return jsonResponse(detail);
      }
      return jsonResponse({ error: { message: "Not found" } }, 404);
    });

    const user = userEvent.setup();
    render(
      <ReceiptDialog
        initialView="history"
        onClose={vi.fn()}
        onCollected={onCollected}
        room={room}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: /PT-VOID-001/ }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Hủy lần thu" }),
    );
    await user.type(screen.getByLabelText("Lý do hủy"), "a");
    await user.click(
      screen.getByRole("button", { name: "Xác nhận hủy lần thu" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nhập lý do ít nhất 3 ký tự",
    );

    await user.clear(screen.getByLabelText("Lý do hủy"));
    await user.type(screen.getByLabelText("Lý do hủy"), "Nhập nhầm số tiền");
    await user.click(
      screen.getByRole("button", { name: "Xác nhận hủy lần thu" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể hủy an toàn",
    );
    await user.click(
      screen.getByRole("button", { name: "Xác nhận hủy lần thu" }),
    );

    expect(await screen.findByText("Lần thu đã được hủy")).toBeInTheDocument();
    expect(onCollected).toHaveBeenCalledWith(
      expect.stringContaining("Đã hủy lần thu PT-VOID-001"),
    );
    expect(
      screen.queryByRole("button", { name: "Hủy lần thu" }),
    ).not.toBeInTheDocument();

    const voidCalls = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(([request, options]) => {
        return (
          String(request).endsWith("/receipts/receipt-void/void") &&
          options?.method === "POST"
        );
      });
    expect(voidCalls).toHaveLength(2);
    expect(voidCalls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
    );
    expect(voidCalls[1]?.[1]?.headers).toEqual(voidCalls[0]?.[1]?.headers);
    expect(JSON.parse(String(voidCalls[1]?.[1]?.body))).toEqual({
      reason: "Nhập nhầm số tiền",
    });
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
