BEGIN;

-- The existing global unique index is stricter than the property-scoped key,
-- so every current row is valid for this index. Create it first to avoid a
-- window without idempotency enforcement.
CREATE UNIQUE INDEX "tenancy_operations_property_type_idempotency_key"
  ON "tenancy_operations"("property_id", "operation_type", "idempotency_key");

DROP INDEX "tenancy_operations_type_idempotency_key";

-- Nullable keys keep PostgreSQL's default NULLS DISTINCT behavior: payments
-- without an idempotency key remain unrestricted, while supplied keys are
-- unique inside each property.
CREATE UNIQUE INDEX "payments_property_idempotency_key"
  ON "payments"("property_id", "idempotency_key");

DROP INDEX "payments_idempotency_key_key";

COMMIT;
