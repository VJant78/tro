import { FormEvent, useState } from "react";
import { Button } from "@repo/ui";
import { apiFetch } from "../api";

export function LoginPanel() {
  const [error, setError] = useState<string | null>(null);
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
      setError(
        loginError instanceof Error ? loginError.message : "Dang nhap loi",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-panel" aria-label="Dang nhap" onSubmit={submit}>
      <h1>Dang nhap</h1>
      <p>Truy cap bang tai khoan chu tro hoac quan ly.</p>
      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}
      <label className="field">
        Email
        <input
          autoComplete="email"
          defaultValue="owner@example.local"
          name="email"
          type="email"
        />
      </label>
      <label className="field">
        Mat khau
        <input
          autoComplete="current-password"
          defaultValue="ChangeMe123!"
          name="password"
          type="password"
        />
      </label>
      <div style={{ marginTop: 18 }}>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Dang dang nhap" : "Dang nhap"}
        </Button>
      </div>
    </form>
  );
}
