-- CreateEnum
CREATE TYPE "UtilityReadingKind" AS ENUM ('MONTHLY', 'MOVE_OUT');

-- CreateEnum
CREATE TYPE "SettlementType" AS ENUM ('MONTHLY', 'MOVE_OUT');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'FINALIZED', 'VOIDED');

-- CreateEnum
CREATE TYPE "AccountEntryType" AS ENUM ('PREPAYMENT', 'CREDIT_APPLIED');

-- AlterTable
ALTER TABLE "utility_readings" ADD COLUMN     "reading_kind" "UtilityReadingKind" NOT NULL DEFAULT 'MONTHLY';

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "settlement_type" "SettlementType" NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "room_id" UUID NOT NULL,
    "tenancy_id" UUID NOT NULL,
    "representative_tenant_id" UUID NOT NULL,
    "utility_reading_id" UUID,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "billing_year" INTEGER NOT NULL,
    "billing_month" INTEGER NOT NULL,
    "occupied_days" INTEGER NOT NULL,
    "days_in_month" INTEGER NOT NULL,
    "rent_amount" DECIMAL(19,0) NOT NULL,
    "prorated_rent_amount" DECIMAL(19,0) NOT NULL,
    "electricity_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "water_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "prepaid_applied_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "carry_forward_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "outstanding_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "finalized_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_account_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tenancy_id" UUID,
    "room_id" UUID,
    "settlement_id" UUID,
    "entry_type" "AccountEntryType" NOT NULL,
    "amount" DECIMAL(19,0) NOT NULL,
    "effective_on" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenant_account_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlements_room_id_billing_year_billing_month_idx" ON "settlements"("room_id", "billing_year", "billing_month");

-- CreateIndex
CREATE INDEX "settlements_tenancy_id_period_start_period_end_idx" ON "settlements"("tenancy_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "settlements_status_settlement_type_idx" ON "settlements"("status", "settlement_type");

-- CreateIndex
CREATE INDEX "tenant_account_entries_tenant_id_effective_on_idx" ON "tenant_account_entries"("tenant_id", "effective_on");

-- CreateIndex
CREATE INDEX "tenant_account_entries_tenancy_id_effective_on_idx" ON "tenant_account_entries"("tenancy_id", "effective_on");

-- CreateIndex
CREATE INDEX "tenant_account_entries_settlement_id_idx" ON "tenant_account_entries"("settlement_id");

-- CreateIndex
CREATE INDEX "utility_readings_tenancy_id_reading_kind_billing_period_sta_idx" ON "utility_readings"("tenancy_id", "reading_kind", "billing_period_start", "billing_period_end");

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_representative_tenant_id_fkey" FOREIGN KEY ("representative_tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_utility_reading_id_fkey" FOREIGN KEY ("utility_reading_id") REFERENCES "utility_readings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_account_entries" ADD CONSTRAINT "tenant_account_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_account_entries" ADD CONSTRAINT "tenant_account_entries_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_account_entries" ADD CONSTRAINT "tenant_account_entries_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_account_entries" ADD CONSTRAINT "tenant_account_entries_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
