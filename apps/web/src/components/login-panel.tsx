import { FormEvent, useState } from "react";
import { Button } from "@repo/ui";
import { apiFetch, messageFor } from "../api";

export function LoginPanel() {
  const [error, setError] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("reason") ===
    "session-expired"
      ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
      : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      window.location.assign("/");
    } catch (loginError) {
      setError(messageFor(loginError, "Không thể đăng nhập."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-panel" aria-label="Đăng nhập" onSubmit={submit}>
      <h1>Đăng nhập</h1>
      <p>Truy cập bằng tài khoản chủ trọ hoặc quản lý.</p>
      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}
      <label className="field">
        Email
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label className="field">
        Mật khẩu
        <input
          autoComplete="current-password"
          name="password"
          required
          type="password"
        />
      </label>
      <div style={{ marginTop: 18 }}>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Đang đăng nhập" : "Đăng nhập"}
        </Button>
      </div>
    </form>
  );
}
