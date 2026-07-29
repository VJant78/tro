import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginPanel } from "./login-panel";

describe("LoginPanel", () => {
  it("renders an accessible login form", () => {
    render(<LoginPanel />);

    expect(screen.getByRole("form", { name: "Dang nhap" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Mat khau")).toBeInTheDocument();
  });
});
