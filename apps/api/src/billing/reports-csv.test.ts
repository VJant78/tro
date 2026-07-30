import { describe, expect, it } from "vitest";
import { safeCsvCell } from "./reports-csv.js";

describe("reports CSV", () => {
  it("escapes quotes and prefixes formula-like cells", () => {
    expect(safeCsvCell('A "room"')).toBe('"A ""room"""');
    expect(safeCsvCell("=cmd|calc")).toBe('"\'=cmd|calc"');
    expect(safeCsvCell("+100")).toBe(`"'+100"`);
    expect(safeCsvCell("@tenant")).toBe('"\'@tenant"');
  });
});
