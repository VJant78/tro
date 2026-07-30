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
    "prisma/migrations/202607300002_security_hardening/migration.sql",
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

describe("security hardening database guards", () => {
  it("keeps legacy payment hashes nullable but validates every supplied hash", () => {
    const payment = prismaBlock("model", "Payment");
    expect(payment).toMatch(/requestHash\s+String\?/);
    expect(migration).toContain(
      'ALTER TABLE "payments" ADD COLUMN "request_hash" TEXT',
    );
    expect(migration).toMatch(
      /"request_hash" IS NULL[\s\S]*?"idempotency_key" IS NOT NULL[\s\S]*?\^\[0-9a-f\]\{64\}\$/,
    );
  });

  it("models cancellation and releases cancelled target reservations", () => {
    const states = prismaBlock("enum", "TenancyOperationStatus");
    const operation = prismaBlock("model", "TenancyOperation");
    expect(states).toMatch(/ACTION_REQUIRED\s+CANCELLED/);
    expect(operation).toMatch(/cancelledAt\s+DateTime\?/);
    expect(operation).toMatch(/cancelReason\s+String\?/);
    expect(migration).toContain(
      'CONSTRAINT "tenancy_operations_terminal_state_check"',
    );

    const reservation = migration.match(
      /CREATE UNIQUE INDEX "tenancy_operations_pending_target_room_unique"([\s\S]*?);/,
    )?.[1];
    expect(reservation).toContain("IN_PROGRESS");
    expect(reservation).toContain("INVOICE_PENDING");
    expect(reservation).toContain("ACTION_REQUIRED");
    expect(reservation).not.toContain("CANCELLED");
  });

  it("backfills and enforces tenant property scope", () => {
    const tenant = prismaBlock("model", "Tenant");
    expect(tenant).toMatch(/propertyId\s+String\s+@map\("property_id"\)/);
    expect(tenant).toContain("@@index([propertyId])");
    expect(migration).toContain(
      "Tenant history spans multiple properties; property scope is ambiguous",
    );
    expect(migration).toContain("00000000-0000-4000-8000-000000000002");
    expect(migration).toContain(
      'ALTER TABLE "tenants" ALTER COLUMN "property_id" SET NOT NULL',
    );
    expect(migration).toContain('CONSTRAINT "tenants_property_id_fkey"');
  });

  it("prevents row updates and deletes in the audit log", () => {
    expect(migration).toContain(
      'CREATE FUNCTION "prevent_audit_log_mutation"()',
    );
    expect(migration).toMatch(
      /CREATE TRIGGER "audit_logs_append_only"\s+BEFORE UPDATE OR DELETE ON "audit_logs"/,
    );
    expect(migration).not.toMatch(/BEFORE TRUNCATE/);
  });
});
