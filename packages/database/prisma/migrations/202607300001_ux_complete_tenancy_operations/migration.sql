BEGIN;

-- Abort instead of guessing if current representative data is inconsistent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "tenancies" t
    LEFT JOIN "tenancy_members" tm
      ON tm."tenancy_id" = t."id"
      AND tm."tenant_id" = t."representative_tenant_id"
      AND tm."left_on" IS NULL
      AND tm."deleted_at" IS NULL
    WHERE t."status" = 'ACTIVE'
      AND t."deleted_at" IS NULL
      AND tm."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Active tenancy has no active membership for representative_tenant_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "tenancy_members" tm
    JOIN "tenancies" t ON t."id" = tm."tenancy_id"
    WHERE t."status" = 'ACTIVE'
      AND t."deleted_at" IS NULL
      AND tm."is_representative" = true
      AND tm."left_on" IS NULL
      AND tm."deleted_at" IS NULL
      AND tm."tenant_id" <> t."representative_tenant_id"
  ) THEN
    RAISE EXCEPTION 'Active tenancy representative flag conflicts with representative_tenant_id';
  END IF;
END $$;

-- Tenancy.representative_tenant_id is the canonical current representative.
DROP INDEX IF EXISTS "tenancy_members_one_representative_unique";

UPDATE "tenancy_members" tm
SET "is_representative" = true,
    "updated_at" = CURRENT_TIMESTAMP
FROM "tenancies" t
WHERE tm."tenancy_id" = t."id"
  AND tm."tenant_id" = t."representative_tenant_id"
  AND tm."left_on" IS NULL
  AND tm."deleted_at" IS NULL
  AND t."status" = 'ACTIVE'
  AND t."deleted_at" IS NULL
  AND tm."is_representative" = false;

CREATE UNIQUE INDEX "tenancy_members_one_representative_unique"
  ON "tenancy_members" ("tenancy_id")
  WHERE "is_representative" = true
    AND "left_on" IS NULL
    AND "deleted_at" IS NULL;

CREATE TYPE "TenancyOperationType" AS ENUM (
  'FINALIZE_AND_INVOICE',
  'WHOLE_GROUP_TRANSFER',
  'WHOLE_GROUP_END'
);

CREATE TYPE "TenancyOperationStatus" AS ENUM (
  'IN_PROGRESS',
  'INVOICE_PENDING',
  'COMPLETED',
  'ACTION_REQUIRED'
);

CREATE TABLE "tenancy_representative_changes" (
  "id" UUID NOT NULL,
  "tenancy_id" UUID NOT NULL,
  "previous_representative_tenant_id" UUID NOT NULL,
  "new_representative_tenant_id" UUID NOT NULL,
  "changed_at" TIMESTAMPTZ(6) NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenancy_representative_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenancy_representative_changes_distinct_tenants_check"
    CHECK ("previous_representative_tenant_id" <> "new_representative_tenant_id"),
  CONSTRAINT "tenancy_representative_changes_idempotency_key_length_check"
    CHECK (char_length("idempotency_key") BETWEEN 16 AND 128),
  CONSTRAINT "tenancy_representative_changes_request_hash_check"
    CHECK ("request_hash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "tenancy_operations" (
  "id" UUID NOT NULL,
  "operation_type" "TenancyOperationType" NOT NULL,
  "status" "TenancyOperationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "source_tenancy_id" UUID NOT NULL,
  "target_room_id" UUID,
  "target_tenancy_id" UUID,
  "utility_reading_id" UUID,
  "settlement_id" UUID,
  "invoice_id" UUID,
  "handover_record_id" UUID,
  "effective_on" DATE NOT NULL,
  "result_json" JSONB,
  "last_error_code" TEXT,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "tenancy_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenancy_operations_completion_check" CHECK (
    ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
    OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL)
  ),
  CONSTRAINT "tenancy_operations_target_room_check" CHECK (
    ("operation_type" = 'WHOLE_GROUP_TRANSFER' AND "target_room_id" IS NOT NULL)
    OR ("operation_type" <> 'WHOLE_GROUP_TRANSFER' AND "target_room_id" IS NULL)
  ),
  CONSTRAINT "tenancy_operations_idempotency_key_length_check"
    CHECK (char_length("idempotency_key") BETWEEN 16 AND 128),
  CONSTRAINT "tenancy_operations_request_hash_check"
    CHECK ("request_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "tenancy_rep_changes_tenancy_idempotency_key"
  ON "tenancy_representative_changes"("tenancy_id", "idempotency_key");
CREATE INDEX "tenancy_representative_changes_tenancy_id_changed_at_idx"
  ON "tenancy_representative_changes"("tenancy_id", "changed_at");
CREATE INDEX "tenancy_representative_changes_previous_tenant_changed_at_idx"
  ON "tenancy_representative_changes"("previous_representative_tenant_id", "changed_at");
CREATE INDEX "tenancy_representative_changes_new_tenant_changed_at_idx"
  ON "tenancy_representative_changes"("new_representative_tenant_id", "changed_at");

CREATE UNIQUE INDEX "tenancy_operations_type_idempotency_key"
  ON "tenancy_operations"("operation_type", "idempotency_key");
CREATE UNIQUE INDEX "tenancy_operations_utility_reading_id_key"
  ON "tenancy_operations"("utility_reading_id");
CREATE UNIQUE INDEX "tenancy_operations_settlement_id_key"
  ON "tenancy_operations"("settlement_id");
CREATE UNIQUE INDEX "tenancy_operations_invoice_id_key"
  ON "tenancy_operations"("invoice_id");
CREATE UNIQUE INDEX "tenancy_operations_handover_record_id_key"
  ON "tenancy_operations"("handover_record_id");
CREATE INDEX "tenancy_operations_source_type_created_at_idx"
  ON "tenancy_operations"("source_tenancy_id", "operation_type", "created_at");
CREATE INDEX "tenancy_operations_status_updated_at_idx"
  ON "tenancy_operations"("status", "updated_at");
CREATE INDEX "tenancy_operations_property_id_status_idx"
  ON "tenancy_operations"("property_id", "status");
CREATE INDEX "tenancy_operations_actor_user_id_created_at_idx"
  ON "tenancy_operations"("actor_user_id", "created_at");
CREATE INDEX "tenancy_operations_target_room_id_status_idx"
  ON "tenancy_operations"("target_room_id", "status");
CREATE INDEX "tenancy_operations_target_tenancy_id_idx"
  ON "tenancy_operations"("target_tenancy_id");
CREATE UNIQUE INDEX "tenancy_operations_pending_target_room_unique"
  ON "tenancy_operations"("target_room_id")
  WHERE "operation_type" = 'WHOLE_GROUP_TRANSFER'
    AND "target_room_id" IS NOT NULL
    AND "status" IN ('IN_PROGRESS', 'INVOICE_PENDING', 'ACTION_REQUIRED');

ALTER TABLE "tenancy_representative_changes"
  ADD CONSTRAINT "tenancy_representative_changes_tenancy_id_fkey"
  FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenancy_representative_changes"
  ADD CONSTRAINT "tenancy_representative_changes_previous_tenant_id_fkey"
  FOREIGN KEY ("previous_representative_tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenancy_representative_changes"
  ADD CONSTRAINT "tenancy_representative_changes_new_tenant_id_fkey"
  FOREIGN KEY ("new_representative_tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenancy_operations"
  ADD CONSTRAINT "tenancy_operations_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenancy_operations"
  ADD CONSTRAINT "tenancy_operations_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenancy_operations"
  ADD CONSTRAINT "tenancy_operations_source_tenancy_id_fkey"
  FOREIGN KEY ("source_tenancy_id") REFERENCES "tenancies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenancy_operations"
  ADD CONSTRAINT "tenancy_operations_target_room_id_fkey"
  FOREIGN KEY ("target_room_id") REFERENCES "rooms"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenancy_operations"
  ADD CONSTRAINT "tenancy_operations_target_tenancy_id_fkey"
  FOREIGN KEY ("target_tenancy_id") REFERENCES "tenancies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenancy_operations"
  ADD CONSTRAINT "tenancy_operations_utility_reading_id_fkey"
  FOREIGN KEY ("utility_reading_id") REFERENCES "utility_readings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenancy_operations"
  ADD CONSTRAINT "tenancy_operations_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenancy_operations"
  ADD CONSTRAINT "tenancy_operations_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenancy_operations"
  ADD CONSTRAINT "tenancy_operations_handover_record_id_fkey"
  FOREIGN KEY ("handover_record_id") REFERENCES "room_handover_records"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
