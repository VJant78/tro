import { FormEvent, useEffect, useState } from "react";
import { Button } from "@repo/ui";
import { ApiError, apiFetch } from "../api";
import type { PricingConfig } from "./types";

const emptyForm = {
  electricityUnitPrice: "3500",
  waterUnitPrice: "15000",
  trashFee: "30000",
  internetFee: "100000",
  serviceFee: "0",
  utilityClosingDay: "28",
  dueDay: "5",
  currencyCode: "VND",
  timezone: "Asia/Ho_Chi_Minh",
  notes: "",
};

const moneyFields = [
  "electricityUnitPrice",
  "waterUnitPrice",
  "trashFee",
  "internetFee",
  "serviceFee",
] as const;

const labels: Record<string, string> = {
  electricityUnitPrice: "Gia dien",
  waterUnitPrice: "Gia nuoc",
  trashFee: "Phi rac",
  internetFee: "Internet",
  serviceFee: "Dich vu",
  utilityClosingDay: "Ngay chot",
  dueDay: "Ngay den han",
  currencyCode: "Tien te",
  timezone: "Mui gio",
};

export function PricingPage() {
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch<PricingConfig | null>(
        "/pricing-configs/global",
      );
      if (response) {
        setConfig(response);
        setForm({
          electricityUnitPrice: response.electricityUnitPrice ?? "",
          waterUnitPrice: response.waterUnitPrice ?? "",
          trashFee: response.trashFee ?? "",
          internetFee: response.internetFee ?? "",
          serviceFee: response.serviceFee ?? "",
          utilityClosingDay: String(response.utilityClosingDay ?? ""),
          dueDay: String(response.dueDay ?? ""),
          currencyCode: response.currencyCode ?? "",
          timezone: response.timezone ?? "",
          notes: response.notes ?? "",
        });
      }
    } catch (loadError) {
      setError(messageFor(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      electricityUnitPrice: form.electricityUnitPrice || null,
      waterUnitPrice: form.waterUnitPrice || null,
      trashFee: form.trashFee || null,
      internetFee: form.internetFee || null,
      serviceFee: form.serviceFee || null,
      utilityClosingDay: form.utilityClosingDay
        ? Number(form.utilityClosingDay)
        : null,
      dueDay: form.dueDay ? Number(form.dueDay) : null,
      currencyCode: form.currencyCode || null,
      timezone: form.timezone || null,
      notes: form.notes || null,
    };

    try {
      const saved = await apiFetch<PricingConfig>("/pricing-configs/global", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setConfig(saved);
      await load();
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.details?.length) {
        setFieldErrors(
          Object.fromEntries(
            saveError.details.map((detail) => [detail.field, detail.message]),
          ),
        );
      }
      setError(messageFor(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="pricing-layout">
      <section className="rooms-list" aria-labelledby="pricing-title">
        <div className="section-heading">
          <div>
            <h1 id="pricing-title">Cau hinh</h1>
            <p>Mot cau hinh phi ap dung cho toan bo he thong</p>
          </div>
        </div>
        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}
        {isLoading ? (
          <div className="room-list-stack">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : (
          <div className="pricing-stack">
            <h2>Dang ap dung</h2>
            <div className="pricing-grid">
              {Object.entries({
                electricityUnitPrice: config?.electricityUnitPrice,
                waterUnitPrice: config?.waterUnitPrice,
                trashFee: config?.trashFee,
                internetFee: config?.internetFee,
                serviceFee: config?.serviceFee,
                utilityClosingDay: config?.utilityClosingDay,
                dueDay: config?.dueDay,
                currencyCode: config?.currencyCode,
                timezone: config?.timezone,
              }).map(([field, value]) => (
                <article className="pricing-cell" key={field}>
                  <small>{labels[field] ?? field}</small>
                  <strong>{String(value ?? "-")}</strong>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="room-detail" aria-labelledby="pricing-form-title">
        <div className="section-heading">
          <div>
            <h2 id="pricing-form-title">Cap nhat cau hinh</h2>
            <p>Gia phong duoc quan ly rieng trong tab Phong</p>
          </div>
        </div>
        <form className="room-form" onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            {moneyFields.map((field) => (
              <label className="field" key={field}>
                {labels[field]}
                <input
                  inputMode="numeric"
                  onChange={(event) =>
                    setForm({ ...form, [field]: event.target.value })
                  }
                  value={form[field]}
                />
                <FieldError message={fieldErrors[field]} />
              </label>
            ))}
            <label className="field">
              Ngay chot
              <input
                inputMode="numeric"
                onChange={(event) =>
                  setForm({ ...form, utilityClosingDay: event.target.value })
                }
                value={form.utilityClosingDay}
              />
              <FieldError message={fieldErrors.utilityClosingDay} />
            </label>
            <label className="field">
              Ngay den han
              <input
                inputMode="numeric"
                onChange={(event) =>
                  setForm({ ...form, dueDay: event.target.value })
                }
                value={form.dueDay}
              />
              <FieldError message={fieldErrors.dueDay} />
            </label>
            <label className="field">
              Tien te
              <input
                onChange={(event) =>
                  setForm({ ...form, currencyCode: event.target.value })
                }
                value={form.currencyCode}
              />
              <FieldError message={fieldErrors.currencyCode} />
            </label>
            <label className="field">
              Mui gio
              <input
                onChange={(event) =>
                  setForm({ ...form, timezone: event.target.value })
                }
                value={form.timezone}
              />
              <FieldError message={fieldErrors.timezone} />
            </label>
          </div>
          <label className="field">
            Ghi chu
            <textarea
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              value={form.notes}
            />
          </label>
          <div className="form-actions">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Dang luu" : "Luu cau hinh"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <small className="field-error">{message}</small> : null;
}

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Co loi xay ra";
}
