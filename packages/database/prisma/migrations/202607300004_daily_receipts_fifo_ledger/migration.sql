-- P6-004: tenancy-owned receipts, FIFO allocation support, and source-lotted credit journal.
-- Compatibility: additive columns are backfilled and reconciled before NOT NULL is enforced.
-- Rollback: application rollback is supported by keeping legacy columns and enum values. The
-- database migration is forward-only once v2 journal rows exist; restore from backup for a full
-- rollback because financial provenance must not be dropped.

CREATE TYPE "AccountJournalType" AS ENUM (
  'LEGACY_PREPAYMENT',
  'LEGACY_CREDIT_APPLIED',
  'RECEIPT_CREDIT',
  'CREDIT_APPLIED',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'REVERSAL'
);
CREATE TYPE "AccountEntryDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "PaymentSourceType" AS ENUM ('LEGACY_INVOICE', 'DAILY_RECEIPT', 'LEGACY_PREPAYMENT');
CREATE TYPE "PaymentOperationType" AS ENUM ('CONFIRM', 'VOID');

ALTER TABLE "payments"
  ADD COLUMN "tenancy_id" UUID,
  ADD COLUMN "source_type" "PaymentSourceType" NOT NULL DEFAULT 'LEGACY_INVOICE',
  ADD COLUMN "receipt_version" INTEGER NOT NULL DEFAULT 1;

-- Existing invoice-targeted payments inherit tenancy from their allocations when unambiguous.
WITH allocation_owner AS (
  SELECT
    pa."payment_id",
    MIN(i."tenancy_id"::text)::uuid AS "tenancy_id",
    COUNT(DISTINCT i."tenancy_id") AS "tenancy_count",
    COUNT(*) FILTER (WHERE i."tenancy_id" IS NULL) AS "missing_count"
  FROM "payment_allocations" pa
  JOIN "invoices" i ON i."id" = pa."invoice_id"
  WHERE pa."deleted_at" IS NULL
  GROUP BY pa."payment_id"
)
UPDATE "payments" p
SET "tenancy_id" = ao."tenancy_id"
FROM allocation_owner ao
WHERE ao."payment_id" = p."id"
  AND ao."tenancy_count" = 1
  AND ao."missing_count" = 0;

-- A legacy unallocated payment may be reconciled only when exactly one tenancy occupied the room
-- at paid_at. Zero or multiple candidates intentionally remain NULL and fail below.
WITH occupancy_owner AS (
  SELECT p."id" AS "payment_id", MIN(t."id"::text)::uuid AS "tenancy_id"
  FROM "payments" p
  JOIN "tenancies" t
    ON t."room_id" = p."room_id"
   AND t."deleted_at" IS NULL
   AND p."paid_at"::date >= t."start_date"
   AND p."paid_at"::date <= COALESCE(t."actual_end_date", 'infinity'::date)
  WHERE p."tenancy_id" IS NULL
  GROUP BY p."id"
  HAVING COUNT(*) = 1
)
UPDATE "payments" p
SET "tenancy_id" = oo."tenancy_id"
FROM occupancy_owner oo
WHERE oo."payment_id" = p."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "payments" WHERE "tenancy_id" IS NULL) THEN
    RAISE EXCEPTION 'P6-004 reconciliation required: Payment tenancy ownership is missing or ambiguous';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "payments" p
    JOIN "tenancies" t ON t."id" = p."tenancy_id"
    JOIN "rooms" r ON r."id" = t."room_id"
    WHERE p."property_id" <> r."property_id" OR p."room_id" <> t."room_id"
  ) THEN
    RAISE EXCEPTION 'P6-004 reconciliation required: Payment property/room does not match tenancy';
  END IF;
END $$;

ALTER TABLE "payments" ALTER COLUMN "tenancy_id" SET NOT NULL;
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_tenancy_id_fkey"
  FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payments_amount_positive_check" CHECK ("amount" > 0) NOT VALID,
  ADD CONSTRAINT "payments_receipt_version_check" CHECK ("receipt_version" IN (1, 2)) NOT VALID,
  ADD CONSTRAINT "payments_void_state_check" CHECK (
    ("status" = 'VOIDED' AND "voided_at" IS NOT NULL AND NULLIF(BTRIM("void_reason"), '') IS NOT NULL)
    OR ("status" <> 'VOIDED' AND "voided_at" IS NULL)
  ) NOT VALID;

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_amount_positive_check" CHECK ("amount" > 0) NOT VALID;

ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_amount_positive_check";
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_receipt_version_check";
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_void_state_check";
ALTER TABLE "payment_allocations" VALIDATE CONSTRAINT "payment_allocations_amount_positive_check";

CREATE INDEX "payments_tenancy_received_idx"
  ON "payments"("tenancy_id", "paid_at", "created_at", "id");

CREATE INDEX "invoices_tenancy_fifo_outstanding_idx"
  ON "invoices"("tenancy_id", "billing_period_start", "due_on", "created_at", "id")
  WHERE "deleted_at" IS NULL
    AND "status" <> 'CANCELLED'
    AND "outstanding_amount" > 0;

CREATE TABLE "payment_operations" (
  "id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "tenancy_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "operation_type" "PaymentOperationType" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "result_json" JSONB NOT NULL,
  "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_operations_idempotency_key_check"
    CHECK (char_length("idempotency_key") BETWEEN 16 AND 128),
  CONSTRAINT "payment_operations_request_hash_check"
    CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "payment_operations_completed_at_check"
    CHECK ("completed_at" >= "created_at"),
  CONSTRAINT "payment_operations_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_operations_tenancy_id_fkey"
    FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_operations_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_operations_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_operations_property_type_idempotency_key"
  ON "payment_operations"("property_id", "operation_type", "idempotency_key");
CREATE UNIQUE INDEX "payment_operations_payment_type_key"
  ON "payment_operations"("payment_id", "operation_type");
CREATE INDEX "payment_operations_tenancy_id_created_at_id_idx"
  ON "payment_operations"("tenancy_id", "created_at", "id");
CREATE INDEX "payment_operations_actor_user_id_created_at_idx"
  ON "payment_operations"("actor_user_id", "created_at");

ALTER TABLE "tenant_account_entries"
  ADD COLUMN "property_id" UUID,
  ADD COLUMN "source_payment_id" UUID,
  ADD COLUMN "payment_allocation_id" UUID,
  ADD COLUMN "source_lot_id" UUID,
  ADD COLUMN "reversal_of_id" UUID,
  ADD COLUMN "payment_operation_id" UUID,
  ADD COLUMN "transfer_correlation" UUID,
  ADD COLUMN "journal_type" "AccountJournalType",
  ADD COLUMN "direction" "AccountEntryDirection",
  ADD COLUMN "journal_version" INTEGER NOT NULL DEFAULT 1;

UPDATE "tenant_account_entries" e
SET "tenancy_id" = s."tenancy_id"
FROM "settlements" s
WHERE e."tenancy_id" IS NULL
  AND e."settlement_id" = s."id";

UPDATE "tenant_account_entries" e
SET "property_id" = r."property_id"
FROM "tenancies" t
JOIN "rooms" r ON r."id" = t."room_id"
WHERE e."tenancy_id" = t."id";

UPDATE "tenant_account_entries"
SET
  "journal_type" = CASE
    WHEN "entry_type" = 'PREPAYMENT' THEN 'LEGACY_PREPAYMENT'::"AccountJournalType"
    WHEN "entry_type" = 'CREDIT_APPLIED' THEN 'LEGACY_CREDIT_APPLIED'::"AccountJournalType"
  END,
  "direction" = CASE
    WHEN "entry_type" = 'PREPAYMENT' THEN 'CREDIT'::"AccountEntryDirection"
    WHEN "entry_type" = 'CREDIT_APPLIED' THEN 'DEBIT'::"AccountEntryDirection"
  END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "tenant_account_entries"
    WHERE "tenancy_id" IS NULL OR "property_id" IS NULL OR "journal_type" IS NULL OR "direction" IS NULL
  ) THEN
    RAISE EXCEPTION 'P6-004 reconciliation required: Legacy account entry tenancy/property ownership is missing or ambiguous';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "tenant_account_entries" e
    JOIN "tenancies" t ON t."id" = e."tenancy_id"
    JOIN "rooms" r ON r."id" = t."room_id"
    WHERE e."property_id" <> r."property_id"
      OR (e."room_id" IS NOT NULL AND e."room_id" <> t."room_id")
  ) THEN
    RAISE EXCEPTION 'P6-004 reconciliation required: Legacy account entry property/room does not match tenancy';
  END IF;
END $$;

ALTER TABLE "tenant_account_entries"
  ALTER COLUMN "property_id" SET NOT NULL,
  ALTER COLUMN "tenancy_id" SET NOT NULL,
  ALTER COLUMN "tenant_id" DROP NOT NULL,
  ALTER COLUMN "entry_type" DROP NOT NULL,
  ALTER COLUMN "journal_type" SET NOT NULL,
  ALTER COLUMN "direction" SET NOT NULL,
  ALTER COLUMN "journal_version" SET DEFAULT 2;

ALTER TABLE "tenant_account_entries"
  ADD CONSTRAINT "tenant_account_entries_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_account_entries_source_payment_id_fkey"
    FOREIGN KEY ("source_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_account_entries_payment_allocation_id_fkey"
    FOREIGN KEY ("payment_allocation_id") REFERENCES "payment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_account_entries_source_lot_id_fkey"
    FOREIGN KEY ("source_lot_id") REFERENCES "tenant_account_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_account_entries_reversal_of_id_fkey"
    FOREIGN KEY ("reversal_of_id") REFERENCES "tenant_account_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_account_entries_payment_operation_id_fkey"
    FOREIGN KEY ("payment_operation_id") REFERENCES "payment_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_account_entries_amount_positive_check" CHECK ("amount" > 0) NOT VALID,
  ADD CONSTRAINT "tenant_account_entries_journal_version_check" CHECK ("journal_version" IN (1, 2)) NOT VALID,
  ADD CONSTRAINT "tenant_account_entries_direction_check" CHECK (
    ("journal_type" IN ('LEGACY_PREPAYMENT', 'RECEIPT_CREDIT', 'TRANSFER_IN') AND "direction" = 'CREDIT')
    OR ("journal_type" IN ('LEGACY_CREDIT_APPLIED', 'CREDIT_APPLIED', 'TRANSFER_OUT') AND "direction" = 'DEBIT')
    OR "journal_type" = 'REVERSAL'
  ) NOT VALID,
  ADD CONSTRAINT "tenant_account_entries_v2_provenance_check" CHECK (
    "journal_version" = 1
    OR (
      "source_payment_id" IS NOT NULL
      AND (
        ("journal_type" = 'RECEIPT_CREDIT' AND "direction" = 'CREDIT' AND "source_lot_id" IS NULL AND "reversal_of_id" IS NULL)
        OR ("journal_type" = 'CREDIT_APPLIED' AND "direction" = 'DEBIT' AND "source_lot_id" IS NOT NULL AND "payment_allocation_id" IS NOT NULL AND "reversal_of_id" IS NULL)
        OR ("journal_type" = 'TRANSFER_OUT' AND "direction" = 'DEBIT' AND "source_lot_id" IS NOT NULL AND "transfer_correlation" IS NOT NULL AND "reversal_of_id" IS NULL)
        OR ("journal_type" = 'TRANSFER_IN' AND "direction" = 'CREDIT' AND "transfer_correlation" IS NOT NULL AND "reversal_of_id" IS NULL)
        OR ("journal_type" = 'REVERSAL' AND "reversal_of_id" IS NOT NULL AND "payment_operation_id" IS NOT NULL)
      )
    )
  ) NOT VALID;

CREATE UNIQUE INDEX "tenant_account_entries_reversal_of_id_key"
  ON "tenant_account_entries"("reversal_of_id")
  WHERE "reversal_of_id" IS NOT NULL;
CREATE INDEX "tenant_account_entries_tenancy_fifo_idx"
  ON "tenant_account_entries"("tenancy_id", "effective_on", "created_at", "id");
CREATE INDEX "tenant_account_entries_property_tenancy_effective_idx"
  ON "tenant_account_entries"("property_id", "tenancy_id", "effective_on");
CREATE INDEX "tenant_account_entries_source_payment_created_idx"
  ON "tenant_account_entries"("source_payment_id", "created_at");
CREATE INDEX "tenant_account_entries_source_lot_created_idx"
  ON "tenant_account_entries"("source_lot_id", "created_at");
CREATE INDEX "tenant_account_entries_payment_allocation_idx"
  ON "tenant_account_entries"("payment_allocation_id");
CREATE INDEX "tenant_account_entries_payment_operation_idx"
  ON "tenant_account_entries"("payment_operation_id");
CREATE INDEX "tenant_account_entries_transfer_correlation_idx"
  ON "tenant_account_entries"("transfer_correlation");

ALTER TABLE "tenant_account_entries" VALIDATE CONSTRAINT "tenant_account_entries_amount_positive_check";
ALTER TABLE "tenant_account_entries" VALIDATE CONSTRAINT "tenant_account_entries_journal_version_check";
ALTER TABLE "tenant_account_entries" VALIDATE CONSTRAINT "tenant_account_entries_direction_check";
ALTER TABLE "tenant_account_entries" VALIDATE CONSTRAINT "tenant_account_entries_v2_provenance_check";

CREATE FUNCTION "prevent_v2_account_entry_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."journal_version" >= 2 THEN
    RAISE EXCEPTION 'P6-004 account journal is append-only';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "tenant_account_entries_v2_append_only"
BEFORE UPDATE OR DELETE ON "tenant_account_entries"
FOR EACH ROW EXECUTE FUNCTION "prevent_v2_account_entry_mutation"();
