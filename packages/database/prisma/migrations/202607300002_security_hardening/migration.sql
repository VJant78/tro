BEGIN;

-- Replace the enum atomically because PostgreSQL cannot use a newly-added enum
-- value in another statement within the same transaction.
DROP INDEX "tenancy_operations_pending_target_room_unique";

ALTER TABLE "tenancy_operations"
  DROP CONSTRAINT "tenancy_operations_completion_check";

CREATE TYPE "TenancyOperationStatus_new" AS ENUM (
  'IN_PROGRESS',
  'INVOICE_PENDING',
  'COMPLETED',
  'ACTION_REQUIRED',
  'CANCELLED'
);

ALTER TABLE "tenancy_operations"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "TenancyOperationStatus_new"
    USING ("status"::text::"TenancyOperationStatus_new");

DROP TYPE "TenancyOperationStatus";
ALTER TYPE "TenancyOperationStatus_new" RENAME TO "TenancyOperationStatus";

ALTER TABLE "tenancy_operations"
  ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

-- Existing payments cannot be hashed reliably without replaying the original
-- canonical request. New application writes must supply this nullable column.
ALTER TABLE "payments" ADD COLUMN "request_hash" TEXT;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_request_hash_check" CHECK (
    "request_hash" IS NULL
    OR (
      "idempotency_key" IS NOT NULL
      AND "request_hash" ~ '^[0-9a-f]{64}$'
    )
  );

ALTER TABLE "tenancy_operations"
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancel_reason" TEXT;

ALTER TABLE "tenancy_operations"
  ADD CONSTRAINT "tenancy_operations_terminal_state_check" CHECK (
    (
      "status" = 'COMPLETED'
      AND "completed_at" IS NOT NULL
      AND "cancelled_at" IS NULL
      AND "cancel_reason" IS NULL
    )
    OR (
      "status" = 'CANCELLED'
      AND "completed_at" IS NULL
      AND "cancelled_at" IS NOT NULL
      AND NULLIF(btrim("cancel_reason"), '') IS NOT NULL
    )
    OR (
      "status" NOT IN ('COMPLETED', 'CANCELLED')
      AND "completed_at" IS NULL
      AND "cancelled_at" IS NULL
      AND "cancel_reason" IS NULL
    )
  );

CREATE UNIQUE INDEX "tenancy_operations_pending_target_room_unique"
  ON "tenancy_operations"("target_room_id")
  WHERE "operation_type" = 'WHOLE_GROUP_TRANSFER'
    AND "target_room_id" IS NOT NULL
    AND "status" IN ('IN_PROGRESS', 'INVOICE_PENDING', 'ACTION_REQUIRED');

-- Add nullable first so legacy tenant rows can be scoped without a table rewrite.
ALTER TABLE "tenants" ADD COLUMN "property_id" UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT scope."tenant_id"
    FROM (
      SELECT member."tenant_id", room."property_id"
      FROM "tenancy_members" member
      JOIN "tenancies" tenancy ON tenancy."id" = member."tenancy_id"
      JOIN "rooms" room ON room."id" = tenancy."room_id"
      UNION
      SELECT tenancy."representative_tenant_id", room."property_id"
      FROM "tenancies" tenancy
      JOIN "rooms" room ON room."id" = tenancy."room_id"
    ) scope
    GROUP BY scope."tenant_id"
    HAVING count(DISTINCT scope."property_id") > 1
  ) THEN
    RAISE EXCEPTION 'Tenant history spans multiple properties; property scope is ambiguous';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "tenants" tenant
    WHERE NOT EXISTS (
      SELECT 1
      FROM "tenancy_members" member
      WHERE member."tenant_id" = tenant."id"
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "tenancies" tenancy
      WHERE tenancy."representative_tenant_id" = tenant."id"
    )
  ) AND NOT EXISTS (
    SELECT 1
    FROM "properties"
    WHERE "id" = '00000000-0000-4000-8000-000000000002'::uuid
      AND "deleted_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Default property is required to scope tenants without tenancy history';
  END IF;
END $$;

WITH tenant_property_scope AS (
  SELECT member."tenant_id", room."property_id"
  FROM "tenancy_members" member
  JOIN "tenancies" tenancy ON tenancy."id" = member."tenancy_id"
  JOIN "rooms" room ON room."id" = tenancy."room_id"
  UNION
  SELECT tenancy."representative_tenant_id", room."property_id"
  FROM "tenancies" tenancy
  JOIN "rooms" room ON room."id" = tenancy."room_id"
),
tenant_property AS (
  SELECT
    scope."tenant_id",
    (array_agg(DISTINCT scope."property_id"))[1] AS "property_id"
  FROM tenant_property_scope scope
  GROUP BY scope."tenant_id"
  HAVING count(DISTINCT scope."property_id") = 1
)
UPDATE "tenants" tenant
SET "property_id" = tenant_property."property_id"
FROM tenant_property
WHERE tenant."id" = tenant_property."tenant_id";

UPDATE "tenants"
SET "property_id" = '00000000-0000-4000-8000-000000000002'::uuid
WHERE "property_id" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "properties"
    WHERE "id" = '00000000-0000-4000-8000-000000000002'::uuid
      AND "deleted_at" IS NULL
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "tenants" WHERE "property_id" IS NULL) THEN
    RAISE EXCEPTION 'Unable to determine property scope for every tenant';
  END IF;
END $$;

ALTER TABLE "tenants" ALTER COLUMN "property_id" SET NOT NULL;

CREATE INDEX "tenants_property_id_idx" ON "tenants"("property_id");

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level append-only protection. TRUNCATE remains an explicit privileged
-- database-owner action and is intentionally not intercepted by this trigger.
CREATE FUNCTION "prevent_audit_log_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_log_mutation"();

COMMIT;
