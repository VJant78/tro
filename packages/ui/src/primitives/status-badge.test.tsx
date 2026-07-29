import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge.js";

describe("StatusBadge", () => {
  it("renders visible status text", () => {
    render(<StatusBadge tone="warning">Qua han</StatusBadge>);

    expect(screen.getByText("Qua han")).toBeDefined();
  });
});
