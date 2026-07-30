export function formatMoney(value: string | number) {
  const amount = Number(value);
  return `${new Intl.NumberFormat("vi-VN").format(Number.isFinite(amount) ? amount : 0)} VND`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN").format(
    new Date(`${value.slice(0, 10)}T00:00:00`),
  );
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeMoneyInput(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function makeIdempotencyKey() {
  return crypto.randomUUID();
}
