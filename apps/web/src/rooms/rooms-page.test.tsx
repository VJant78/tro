import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomsPage } from "./rooms-page";

const room = {
  id: "00000000-0000-4000-8000-000000000101",
  code: "A-101",
  name: "Phong A101",
  roomType: null,
  status: "VACANT",
  defaultRentAmount: "2500000",
  defaultBillingCycleType: "MONTHLY",
  defaultBillingCycleCount: 1,
  maxOccupants: 2,
  depositAmount: "500000",
  notes: null,
  currentOccupancy: null,
};

describe("RoomsPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/rooms?")) {
        return jsonResponse({
          data: [room],
          page: { limit: 50, nextCursor: null, hasMore: false },
        });
      }

      if (url.endsWith("/rooms") && method === "POST") {
        return jsonResponse(
          { ...room, code: "B-202", name: "Phong B202" },
          201,
        );
      }

      return jsonResponse({ error: { message: "Not found" } }, 404);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders rooms and submits create form", async () => {
    const user = userEvent.setup();
    render(<RoomsPage />);

    expect(await screen.findByText("A-101")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tao phong" }));
    await user.type(screen.getByLabelText("Ma phong"), "B-202");
    await user.type(screen.getByLabelText("Ten phong"), "Phong B202");
    await user.click(screen.getByRole("button", { name: "Tao" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/rooms"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows API errors", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ error: { message: "Authentication required" } }, 401),
    );

    render(<RoomsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Authentication required",
    );
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
