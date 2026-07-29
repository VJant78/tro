import { describe, expect, it } from "vitest";
import { databaseConventions } from "./schema-conventions.js";

describe("databaseConventions", () => {
  it("documents financial date and money conventions", () => {
    expect(databaseConventions.money).toContain("Decimal");
    expect(databaseConventions.paidUntil).toContain("exclusive");
  });
});
