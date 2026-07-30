import { describe, expect, it } from "vitest";
import {
  boundedMoneySchema,
  meterReadingSchema,
  meterValue,
  moneyString,
  moneyValue,
  utilityAmount,
} from "./numeric.js";

describe("bounded financial input", () => {
  it.each(["abc", "1e3", "Infinity", "-1", "1.25", "10000000000000000000"])(
    "rejects invalid money value %s",
    (value) => {
      expect(boundedMoneySchema.safeParse(value).success).toBe(false);
    },
  );

  it("accepts the maximum database money value exactly", () => {
    const maximum = "9999999999999999999";
    expect(boundedMoneySchema.parse(maximum)).toBe(maximum);
    expect(moneyString(moneyValue(maximum))).toBe(maximum);
  });

  it.each(["NaN", "1e3", "-1", "1.2345", "100000000000"])(
    "rejects invalid meter value %s",
    (value) => {
      expect(meterReadingSchema.safeParse(value).success).toBe(false);
    },
  );

  it("keeps meter precision deterministic and rejects money overflow", () => {
    expect(meterValue("12.345")).toBe(12_345n);
    expect(() => utilityAmount(99_999_999_999_999n, 9_999_999_999n)).toThrow(
      "Numeric value is outside the supported range",
    );
  });
});
