export const databaseConventions = {
  money: "Decimal(19, 0) for VND amounts; never floating point",
  date: "date for business periods, timestamptz for instants",
  paidUntil: "exclusive boundary",
  billingPeriod: "start inclusive, end exclusive",
  timezone: "Asia/Ho_Chi_Minh by default",
} as const;
