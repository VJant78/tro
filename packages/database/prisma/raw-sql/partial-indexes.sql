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
  WHERE "is_representative" = true
    AND "left_on" IS NULL
    AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "utility_readings_one_finalized_period_unique"
  ON "utility_readings" ("room_id", "billing_period_start", "billing_period_end")
  WHERE "status" = 'FINALIZED' AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_one_active_period_unique"
  ON "invoices" ("room_id", "invoice_type", "billing_period_start", "billing_period_end")
  WHERE "deleted_at" IS NULL AND "status" <> 'CANCELLED';

-- Available after UX-COMPLETE-001 creates tenancy_operations.
CREATE UNIQUE INDEX IF NOT EXISTS "tenancy_operations_pending_target_room_unique"
  ON "tenancy_operations" ("target_room_id")
  WHERE "operation_type" = 'WHOLE_GROUP_TRANSFER'
    AND "target_room_id" IS NOT NULL
    AND "status" IN ('IN_PROGRESS', 'INVOICE_PENDING', 'ACTION_REQUIRED');

-- Deterministic FIFO scan used by P6-004 receipt allocation.
CREATE INDEX IF NOT EXISTS "invoices_tenancy_fifo_outstanding_idx"
  ON "invoices" ("tenancy_id", "billing_period_start", "due_on", "created_at", "id")
  WHERE "deleted_at" IS NULL
    AND "status" <> 'CANCELLED'
    AND "outstanding_amount" > 0;
