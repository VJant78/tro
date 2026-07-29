-- PostgreSQL-specific business constraints for soft-delete aware uniqueness.
-- Mirrored in the Phase 2 foundation migration after the generated base schema SQL.

CREATE UNIQUE INDEX IF NOT EXISTS "rooms_active_code_unique"
  ON "rooms" ("property_id", "code")
  WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "tenancies_one_active_room_unique"
  ON "tenancies" ("room_id")
  WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "tenancy_members_one_active_tenant_unique"
  ON "tenancy_members" ("tenant_id")
  WHERE "left_on" IS NULL AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "tenancy_members_one_representative_unique"
  ON "tenancy_members" ("tenancy_id")
  WHERE "is_representative" = true AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "utility_readings_one_finalized_period_unique"
  ON "utility_readings" ("room_id", "billing_period_start", "billing_period_end")
  WHERE "status" = 'FINALIZED' AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_one_active_period_unique"
  ON "invoices" ("room_id", "invoice_type", "billing_period_start", "billing_period_end")
  WHERE "deleted_at" IS NULL AND "status" <> 'CANCELLED';
