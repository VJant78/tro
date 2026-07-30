import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");
const schema = readFileSync(
  resolve(packageRoot, "prisma/schema.prisma"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    packageRoot,
    "prisma/migrations/202607300004_daily_receipts_fifo_ledger/migration.sql",
  ),
  "utf8",
);

function prismaBlock(kind: "enum" | "model", name: string) {
  const match = schema.match(
    new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`),
  );
  expect(match, `${kind} ${name} must exist`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("P6-004 tenancy receipt database contract", () => {
  it("owns every payment and journal entry by tenancy", () => {
    const payment = prismaBlock("model", "Payment");
    const journal = prismaBlock("model", "TenantAccountEntry");

    expect(payment).toMatch(/tenancyId\s+String\s+@map\("tenancy_id"\)/);
    expect(journal).toMatch(/propertyId\s+String\s+@map\("property_id"\)/);
    expect(journal).toMatch(/tenancyId\s+String\s+@map\("tenancy_id"\)/);
    expect(journal).toMatch(/tenantId\s+String\?/);
    expect(migration).toContain(
      "Payment tenancy ownership is missing or ambiguous",
    );
    expect(migration).toContain(
      "Legacy account entry tenancy/property ownership is missing or ambiguous",
    );
  });

  it("stores signed source-lotted provenance without a mutable balance", () => {
    const journal = prismaBlock("model", "TenantAccountEntry");

    expect(journal).toContain("direction");
    expect(journal).toContain("journalType");
    expect(journal).toContain("sourcePaymentId");
    expect(journal).toContain("paymentAllocationId");
    expect(journal).toContain("sourceLotId");
    expect(journal).toContain("reversalOfId");
    expect(journal).toContain("transferCorrelation");
    expect(journal).not.toMatch(/\bbalance\b/i);
    expect(migration).toContain(
      'CONSTRAINT "tenant_account_entries_v2_provenance_check"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "tenant_account_entries_v2_append_only"',
    );
  });

  it("supports operation-scoped idempotency and one void command", () => {
    const operation = prismaBlock("model", "PaymentOperation");

    expect(operation).toContain(
      '@@unique([propertyId, operationType, idempotencyKey], map: "payment_operations_property_type_idempotency_key")',
    );
    expect(operation).toContain(
      '@@unique([paymentId, operationType], map: "payment_operations_payment_type_key")',
    );
    expect(migration).toContain(
      'CONSTRAINT "payment_operations_request_hash_check"',
    );
  });

  it("provides positive-money guards and deterministic FIFO indexes", () => {
    expect(migration).toContain('CHECK ("amount" > 0)');
    expect(migration).toMatch(
      /"invoices_tenancy_fifo_outstanding_idx"[\s\S]*?"billing_period_start", "due_on", "created_at", "id"/,
    );
    expect(migration).toMatch(
      /"payments_tenancy_received_idx"[\s\S]*?"tenancy_id", "paid_at", "created_at", "id"/,
    );
  });

  it("keeps cross-row lot and allocation sums in the Serializable backend boundary", () => {
    expect(migration).not.toMatch(
      /CREATE\s+(CONSTRAINT\s+)?TRIGGER[\s\S]*overdraw/i,
    );
    expect(migration).toContain("financial provenance must not be dropped");
  });
});
