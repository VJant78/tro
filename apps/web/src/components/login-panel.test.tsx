import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginPanel } from "./login-panel";

describe("LoginPanel", () => {
  it("renders an accessible login form", () => {
    render(<LoginPanel />);

    expect(screen.getByRole("form", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Mật khẩu")).toHaveValue("");
  });
});
