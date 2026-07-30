import { FormEvent, useEffect, useState } from "react";
import { Button } from "@repo/ui";
import { ApiError, apiFetch, messageFor } from "../api";
import { formatMoney, normalizeMoneyInput } from "../format";
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
  electricityUnitPrice: "Giá điện",
  waterUnitPrice: "Giá nước",
  trashFee: "Phí rác",
  internetFee: "Internet",
  serviceFee: "Dịch vụ",
  utilityClosingDay: "Ngày chốt",
  dueDay: "Ngày đến hạn",
  currencyCode: "Tiền tệ",
  timezone: "Múi giờ",
};

export function PricingPage() {
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
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
      setSuccess("Đã cập nhật cấu hình chung.");
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
            <h1 id="pricing-title">Cài đặt</h1>
            <p>Một cấu hình chung áp dụng cho toàn bộ hệ thống</p>
          </div>
        </div>
        {error ? (
          <div className="notice error" role="alert">
            <span>{error}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void load()}
            >
              Thử lại
            </Button>
          </div>
        ) : null}
        {success ? (
          <div className="notice success" aria-live="polite">
            {success}
          </div>
        ) : null}
        {isLoading ? (
          <div className="room-list-stack">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : (
          <div className="pricing-stack">
            <h2>Đang áp dụng</h2>
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
                  <strong>{formatConfigValue(field, value)}</strong>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="room-detail" aria-labelledby="pricing-form-title">
        <div className="section-heading">
          <div>
            <h2 id="pricing-form-title">Cập nhật cấu hình</h2>
            <p>Giá phòng được quản lý riêng trong tab Phòng</p>
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
                    setForm({
                      ...form,
                      [field]: normalizeMoneyInput(event.target.value),
                    })
                  }
                  value={form[field]}
                />
                <small className="field-hint">
                  {formatMoney(form[field])}
                  {unitFor(field)}
                </small>
                <FieldError message={fieldErrors[field]} />
              </label>
            ))}
            <label className="field">
              Ngày chốt
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
              Ngày đến hạn
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
              Tiền tệ
              <input
                onChange={(event) =>
                  setForm({ ...form, currencyCode: event.target.value })
                }
                value={form.currencyCode}
              />
              <FieldError message={fieldErrors.currencyCode} />
            </label>
            <label className="field">
              Múi giờ
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
            Ghi chú
            <textarea
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              value={form.notes}
            />
          </label>
          <div className="form-actions">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Đang lưu" : "Lưu cấu hình"}
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

function unitFor(field: (typeof moneyFields)[number]) {
  if (field === "electricityUnitPrice") return "/kWh";
  if (field === "waterUnitPrice") return "/m³";
  return "";
}

function formatConfigValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (moneyFields.includes(field as (typeof moneyFields)[number])) {
    return `${formatMoney(String(value))}${unitFor(field as (typeof moneyFields)[number])}`;
  }
  if (field === "utilityClosingDay" || field === "dueDay")
    return `Ngày ${String(value)}`;
  return String(value);
}
