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
    "prisma/migrations/202607300001_ux_complete_tenancy_operations/migration.sql",
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

describe("UX-COMPLETE-001 database guards", () => {
  it("uses the ADR operation types and resumable states", () => {
    expect(prismaBlock("enum", "TenancyOperationType")).toMatch(
      /FINALIZE_AND_INVOICE\s+WHOLE_GROUP_TRANSFER\s+WHOLE_GROUP_END/,
    );
    expect(prismaBlock("enum", "TenancyOperationStatus")).toMatch(
      /IN_PROGRESS\s+INVOICE_PENDING\s+COMPLETED\s+ACTION_REQUIRED\s+CANCELLED/,
    );
    expect(migration).not.toMatch(/'PENDING'|'FAILED'/);
  });

  it("scopes operation replay keys by property and operation type", () => {
    const operation = prismaBlock("model", "TenancyOperation");
    expect(operation).toContain(
      '@@unique([propertyId, operationType, idempotencyKey], map: "tenancy_operations_property_type_idempotency_key")',
    );
    expect(operation).not.toMatch(/idempotencyKey\s+String\s+@unique/);
    // This migration records the original index; a later hardening migration
    // replaces it without rewriting existing operation rows.
    expect(migration).toContain(
      'ON "tenancy_operations"("operation_type", "idempotency_key")',
    );
  });

  it("scopes representative replay keys by tenancy and stores request semantics", () => {
    const history = prismaBlock("model", "TenancyRepresentativeChange");
    expect(history).toContain("requestHash");
    expect(history).toContain(
      '@@unique([tenancyId, idempotencyKey], map: "tenancy_rep_changes_tenancy_idempotency_key")',
    );
    expect(migration).toContain(
      'ON "tenancy_representative_changes"("tenancy_id", "idempotency_key")',
    );
    expect(migration).toContain(
      'CONSTRAINT "tenancy_representative_changes_request_hash_check"',
    );
  });

  it("reserves a target room for every unresolved whole-group transfer", () => {
    const operation = prismaBlock("model", "TenancyOperation");
    expect(operation).toMatch(/targetRoomId\s+String\?/);
    expect(operation).toContain("references: [id], onDelete: Restrict)");
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "tenancy_operations_pending_target_room_unique"[\s\S]*?ON "tenancy_operations"\("target_room_id"\)[\s\S]*?"operation_type" = 'WHOLE_GROUP_TRANSFER'[\s\S]*?"status" IN \('IN_PROGRESS', 'INVOICE_PENDING', 'ACTION_REQUIRED'\)/,
    );
    expect(migration).toContain(
      'CONSTRAINT "tenancy_operations_target_room_check"',
    );
    expect(migration).toContain(
      'CONSTRAINT "tenancy_operations_target_room_id_fkey"',
    );
  });

  it("validates existing representatives and enforces one active representative", () => {
    expect(migration).toContain(
      "Active tenancy has no active membership for representative_tenant_id",
    );
    expect(migration).toContain(
      "Active tenancy representative flag conflicts with representative_tenant_id",
    );
    expect(migration).toMatch(
      /WHERE "is_representative" = true\s+AND "left_on" IS NULL\s+AND "deleted_at" IS NULL/,
    );
  });

  it("constrains opaque keys, SHA-256 hashes and completion timestamps", () => {
    expect(migration).toContain(
      'CHECK (char_length("idempotency_key") BETWEEN 16 AND 128)',
    );
    expect(migration).toContain(`CHECK ("request_hash" ~ '^[0-9a-f]{64}$')`);
    expect(migration).toContain(
      'CONSTRAINT "tenancy_operations_completion_check"',
    );
  });
});
