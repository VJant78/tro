import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PricingPage } from "./pricing-page";

describe("PricingPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/pricing-configs/global") && method === "PATCH") {
        return jsonResponse({
          id: "pricing-1",
          scope: "SYSTEM",
          propertyId: null,
          roomId: null,
          tenancyId: null,
          rentAmount: null,
          electricityUnitPrice: "4200",
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
        });
      }

      if (url.endsWith("/pricing-configs/global")) {
        return jsonResponse({
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
        });
      }

      return jsonResponse({ error: { message: "Not found" } }, 404);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders global pricing and updates it", async () => {
    const user = userEvent.setup();
    render(<PricingPage />);

    expect(await screen.findByText("Dang ap dung")).toBeInTheDocument();
    expect(screen.getByText("3500")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Gia dien"));
    await user.type(screen.getByLabelText("Gia dien"), "4200");
    await user.click(screen.getByRole("button", { name: "Luu cau hinh" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/pricing-configs/global"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
