-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF', 'VIEWER');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('VACANT', 'OCCUPIED', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'LEFT', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TenancyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingCycleType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "UtilityReadingStatus" AS ENUM ('DRAFT', 'FINALIZED', 'VOIDED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('RENT', 'UTILITY', 'COMBINED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceItemType" AS ENUM ('RENT', 'ELECTRICITY', 'WATER', 'TRASH', 'INTERNET', 'SERVICE', 'SURCHARGE', 'DISCOUNT', 'ADJUSTMENT', 'PREVIOUS_DEBT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'VOIDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'STATUS_CHANGE', 'ISSUE_INVOICE', 'CONFIRM_PAYMENT', 'VOID_PAYMENT', 'ADJUST_DEBT', 'FINALIZE_READING', 'CHANGE_PRICING');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "owner_user_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_groups" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "room_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_group_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room_type" TEXT,
    "status" "RoomStatus" NOT NULL DEFAULT 'VACANT',
    "default_rent_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "default_billing_cycle_type" "BillingCycleType" NOT NULL DEFAULT 'MONTHLY',
    "default_billing_cycle_count" INTEGER NOT NULL DEFAULT 1,
    "max_occupants" INTEGER NOT NULL DEFAULT 1,
    "current_rent_started_on" DATE,
    "rent_paid_until" DATE,
    "deposit_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "date_of_birth" DATE,
    "gender" TEXT,
    "identity_number" TEXT,
    "identity_issued_on" DATE,
    "identity_issued_at" TEXT,
    "permanent_address" TEXT,
    "hometown" TEXT,
    "vehicle_plate" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "identity_document_url" TEXT,
    "notes" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenancies" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "representative_tenant_id" UUID NOT NULL,
    "status" "TenancyStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" DATE NOT NULL,
    "expected_end_date" DATE,
    "actual_end_date" DATE,
    "billing_cycle_type" "BillingCycleType" NOT NULL,
    "billing_cycle_count" INTEGER NOT NULL DEFAULT 1,
    "billing_anchor_day" INTEGER,
    "rent_amount" DECIMAL(19,0) NOT NULL,
    "rent_paid_until" DATE,
    "deposit_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenancy_members" (
    "id" UUID NOT NULL,
    "tenancy_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" TEXT,
    "joined_on" DATE NOT NULL,
    "left_on" DATE,
    "is_representative" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenancy_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_readings" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "tenancy_id" UUID,
    "billing_period_start" DATE NOT NULL,
    "billing_period_end" DATE NOT NULL,
    "billing_year" INTEGER NOT NULL,
    "billing_month" INTEGER NOT NULL,
    "electricity_previous" DECIMAL(14,3) NOT NULL,
    "electricity_current" DECIMAL(14,3) NOT NULL,
    "electricity_usage" DECIMAL(14,3) NOT NULL,
    "electricity_unit_price" DECIMAL(19,0) NOT NULL,
    "electricity_amount" DECIMAL(19,0) NOT NULL,
    "water_previous" DECIMAL(14,3) NOT NULL,
    "water_current" DECIMAL(14,3) NOT NULL,
    "water_usage" DECIMAL(14,3) NOT NULL,
    "water_unit_price" DECIMAL(19,0) NOT NULL,
    "water_amount" DECIMAL(19,0) NOT NULL,
    "status" "UtilityReadingStatus" NOT NULL DEFAULT 'DRAFT',
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "utility_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "tenancy_id" UUID,
    "payer_tenant_id" UUID,
    "invoice_type" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "billing_period_start" DATE NOT NULL,
    "billing_period_end" DATE NOT NULL,
    "billing_year" INTEGER NOT NULL,
    "billing_month" INTEGER,
    "issued_on" DATE,
    "due_on" DATE NOT NULL,
    "total_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "outstanding_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "fully_paid_at" TIMESTAMPTZ(6),
    "locked_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "source_key" TEXT,
    "pricing_snapshot" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "item_type" "InvoiceItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unit_price" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "amount" DECIMAL(19,0) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "payment_number" TEXT NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "payer_tenant_id" UUID,
    "amount" DECIMAL(19,0) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "external_transaction_id" TEXT,
    "idempotency_key" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "voided_at" TIMESTAMPTZ(6),
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(19,0) NOT NULL,
    "allocated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_handover_records" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "tenancy_id" UUID,
    "handover_type" TEXT NOT NULL,
    "handover_at" TIMESTAMPTZ(6) NOT NULL,
    "electricity_reading" DECIMAL(14,3),
    "water_reading" DECIMAL(14,3),
    "deposit_amount" DECIMAL(19,0) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "room_handover_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "value_type" TEXT NOT NULL,
    "description" TEXT,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "properties_owner_user_id_code_key" ON "properties"("owner_user_id", "code");

-- CreateIndex
CREATE INDEX "room_groups_property_id_sort_order_idx" ON "room_groups"("property_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "room_groups_property_id_code_key" ON "room_groups"("property_id", "code");

-- CreateIndex
CREATE INDEX "rooms_property_id_status_idx" ON "rooms"("property_id", "status");

-- CreateIndex
CREATE INDEX "rooms_room_group_id_status_idx" ON "rooms"("room_group_id", "status");

-- CreateIndex
CREATE INDEX "rooms_rent_paid_until_idx" ON "rooms"("rent_paid_until");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_identity_number_key" ON "tenants"("identity_number");

-- CreateIndex
CREATE INDEX "tenants_full_name_idx" ON "tenants"("full_name");

-- CreateIndex
CREATE INDEX "tenants_phone_idx" ON "tenants"("phone");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "tenancies_room_id_status_idx" ON "tenancies"("room_id", "status");

-- CreateIndex
CREATE INDEX "tenancies_representative_tenant_id_status_idx" ON "tenancies"("representative_tenant_id", "status");

-- CreateIndex
CREATE INDEX "tenancies_rent_paid_until_idx" ON "tenancies"("rent_paid_until");

-- CreateIndex
CREATE INDEX "tenancy_members_tenant_id_left_on_idx" ON "tenancy_members"("tenant_id", "left_on");

-- CreateIndex
CREATE INDEX "tenancy_members_tenancy_id_left_on_idx" ON "tenancy_members"("tenancy_id", "left_on");

-- CreateIndex
CREATE UNIQUE INDEX "tenancy_members_tenancy_id_tenant_id_key" ON "tenancy_members"("tenancy_id", "tenant_id");

-- CreateIndex
CREATE INDEX "utility_readings_room_id_billing_year_billing_month_idx" ON "utility_readings"("room_id", "billing_year", "billing_month");

-- CreateIndex
CREATE INDEX "utility_readings_status_billing_period_start_billing_period_idx" ON "utility_readings"("status", "billing_period_start", "billing_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_source_key_key" ON "invoices"("source_key");

-- CreateIndex
CREATE INDEX "invoices_room_id_status_idx" ON "invoices"("room_id", "status");

-- CreateIndex
CREATE INDEX "invoices_tenancy_id_status_idx" ON "invoices"("tenancy_id", "status");

-- CreateIndex
CREATE INDEX "invoices_invoice_type_billing_period_start_billing_period_e_idx" ON "invoices"("invoice_type", "billing_period_start", "billing_period_end");

-- CreateIndex
CREATE INDEX "invoices_due_on_status_idx" ON "invoices"("due_on", "status");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_items_item_type_idx" ON "invoice_items"("item_type");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_number_key" ON "payments"("payment_number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_external_transaction_id_key" ON "payments"("external_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_room_id_status_idx" ON "payments"("room_id", "status");

-- CreateIndex
CREATE INDEX "payments_payer_tenant_id_paid_at_idx" ON "payments"("payer_tenant_id", "paid_at");

-- CreateIndex
CREATE INDEX "payments_status_paid_at_idx" ON "payments"("status", "paid_at");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_id_allocated_at_idx" ON "payment_allocations"("invoice_id", "allocated_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_invoice_id_key" ON "payment_allocations"("payment_id", "invoice_id");

-- CreateIndex
CREATE INDEX "room_handover_records_room_id_handover_at_idx" ON "room_handover_records"("room_id", "handover_at");

-- CreateIndex
CREATE INDEX "room_handover_records_tenancy_id_handover_at_idx" ON "room_handover_records"("tenancy_id", "handover_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_groups" ADD CONSTRAINT "room_groups_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_group_id_fkey" FOREIGN KEY ("room_group_id") REFERENCES "room_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_representative_tenant_id_fkey" FOREIGN KEY ("representative_tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancy_members" ADD CONSTRAINT "tenancy_members_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancy_members" ADD CONSTRAINT "tenancy_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_readings" ADD CONSTRAINT "utility_readings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_readings" ADD CONSTRAINT "utility_readings_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payer_tenant_id_fkey" FOREIGN KEY ("payer_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_tenant_id_fkey" FOREIGN KEY ("payer_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_handover_records" ADD CONSTRAINT "room_handover_records_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_handover_records" ADD CONSTRAINT "room_handover_records_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PostgreSQL partial indexes for soft-delete aware business constraints.

-- PostgreSQL-specific business constraints for soft-delete aware uniqueness.
-- Apply through a reviewed Prisma migration after the base schema migration is generated.

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
