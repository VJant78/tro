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
    "prisma/migrations/202607300003_property_scoped_idempotency/migration.sql",
  ),
  "utf8",
);

function prismaModel(name: string) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  expect(match, `model ${name} must exist`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("property-scoped idempotency", () => {
  it("uses property, operation type and key as the Prisma unique identity", () => {
    const operation = prismaModel("TenancyOperation");
    expect(operation).toContain(
      '@@unique([propertyId, operationType, idempotencyKey], map: "tenancy_operations_property_type_idempotency_key")',
    );
    expect(operation).not.toContain(
      '@@unique([operationType, idempotencyKey], map: "tenancy_operations_type_idempotency_key")',
    );
  });

  it("creates the property-scoped index before removing the global index", () => {
    const createPosition = migration.indexOf(
      'CREATE UNIQUE INDEX "tenancy_operations_property_type_idempotency_key"',
    );
    const dropPosition = migration.indexOf(
      'DROP INDEX "tenancy_operations_type_idempotency_key"',
    );

    expect(migration).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain(
      'ON "tenancy_operations"("property_id", "operation_type", "idempotency_key")',
    );
    expect(createPosition).toBeGreaterThan(-1);
    expect(dropPosition).toBeGreaterThan(createPosition);
  });

  it("scopes nullable payment keys by property", () => {
    const payment = prismaModel("Payment");
    expect(payment).toMatch(
      /idempotencyKey\s+String\?\s+@map\("idempotency_key"\)/,
    );
    expect(payment).not.toMatch(/idempotencyKey\s+String\?\s+@unique/);
    expect(payment).toContain(
      '@@unique([propertyId, idempotencyKey], map: "payments_property_idempotency_key")',
    );

    const createPosition = migration.indexOf(
      'CREATE UNIQUE INDEX "payments_property_idempotency_key"',
    );
    const dropPosition = migration.indexOf(
      'DROP INDEX "payments_idempotency_key_key"',
    );

    expect(migration).toContain(
      'ON "payments"("property_id", "idempotency_key")',
    );
    expect(migration).not.toMatch(
      /ALTER\s+(?:TABLE\s+)?"payments"[\s\S]*?"idempotency_key"\s+SET\s+NOT\s+NULL/i,
    );
    expect(createPosition).toBeGreaterThan(-1);
    expect(dropPosition).toBeGreaterThan(createPosition);
  });

  it("does not rewrite or delete existing operation data", () => {
    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/);
  });
});
