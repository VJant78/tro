import { z } from "zod";
import { DomainException } from "./domain.exception.js";

const MAX_MONEY = 10n ** 19n - 1n;
const MONEY_PATTERN = /^(0|[1-9]\d{0,18})$/;
const METER_PATTERN = /^(0|[1-9]\d{0,10})(\.\d{1,3})?$/;

export const boundedMoneySchema = z
  .string()
  .trim()
  .regex(MONEY_PATTERN, "Must be an integer from 0 to 19 digits");

export const positiveMoneySchema = boundedMoneySchema.refine(
  (value) => value !== "0",
  "Must be greater than zero",
);

export const meterReadingSchema = z
  .string()
  .trim()
  .regex(
    METER_PATTERN,
    "Must have at most 11 integral digits and 3 decimal places",
  );

export function moneyValue(value: string) {
  if (!MONEY_PATTERN.test(value)) throw numericRangeError();
  return BigInt(value);
}

export function moneyString(value: bigint) {
  if (value < 0n || value > MAX_MONEY) throw numericRangeError();
  return value.toString();
}

export function meterValue(value: string) {
  if (!METER_PATTERN.test(value)) throw numericRangeError();
  const [integral = "0", fractional = ""] = value.split(".");
  return BigInt(integral) * 1000n + BigInt(fractional.padEnd(3, "0"));
}

export function meterString(value: bigint) {
  if (value < 0n || value > 99_999_999_999_999n) throw numericRangeError();
  const integral = value / 1000n;
  const fraction = (value % 1000n).toString().padStart(3, "0");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${integral}.${trimmed}` : integral.toString();
}

export function roundedDivide(numerator: bigint, denominator: bigint) {
  if (numerator < 0n || denominator <= 0n) throw numericRangeError();
  return (numerator + denominator / 2n) / denominator;
}

export function utilityAmount(usageScaled: bigint, unitPrice: bigint) {
  return moneyString(roundedDivide(usageScaled * unitPrice, 1000n));
}

export function sumMoney(values: string[]) {
  return moneyString(
    values.reduce((total, value) => total + moneyValue(value), 0n),
  );
}

export function minMoney(left: bigint, right: bigint) {
  return left <= right ? left : right;
}

function numericRangeError() {
  return new DomainException(
    "NUMERIC_VALUE_OUT_OF_RANGE",
    "Numeric value is outside the supported range",
    422,
  );
}
