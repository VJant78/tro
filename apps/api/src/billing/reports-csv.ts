import type { MonthlyReportRecord } from "./billing.types.js";

export function monthlyReportToCsv(report: MonthlyReportRecord) {
  const rows = [
    [
      "Loai",
      "Phong",
      "Nguoi thue",
      "Ma",
      "Ky",
      "Han/Ngay thu",
      "Tong",
      "Da thu",
      "Con thu",
      "Trang thai",
    ],
    ...report.invoices.map((invoice) => [
      "Hoa don",
      invoice.roomCode ?? invoice.roomId,
      invoice.payerTenantName ?? "",
      invoice.invoiceNumber,
      `${invoice.billingPeriodStart} - ${invoice.billingPeriodEnd}`,
      invoice.dueOn,
      invoice.totalAmount,
      invoice.paidAmount,
      invoice.outstandingAmount,
      invoice.status,
    ]),
    ...report.payments.map((payment) => [
      "Thanh toan",
      payment.roomCode ?? payment.roomId,
      payment.payerTenantName ?? "",
      payment.paymentNumber,
      "",
      payment.paidAt,
      payment.amount,
      payment.amount,
      "0",
      payment.status,
    ]),
    ...report.debts.map((debt) => [
      "Cong no",
      debt.roomCode ?? debt.roomId,
      debt.payerTenantName ?? "",
      "",
      `${report.periodStart} - ${report.periodEnd}`,
      debt.nearestDueOn ?? "",
      debt.totalOutstanding,
      "",
      debt.totalOutstanding,
      debt.debtStatus,
    ]),
  ];

  return rows.map((row) => row.map(safeCsvCell).join(",")).join("\r\n");
}

export function safeCsvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}
