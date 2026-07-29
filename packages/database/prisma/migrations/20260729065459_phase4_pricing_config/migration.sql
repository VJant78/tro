-- CreateEnum
CREATE TYPE "PricingScope" AS ENUM ('SYSTEM', 'PROPERTY', 'ROOM', 'TENANCY');

-- CreateTable
CREATE TABLE "pricing_configs" (
    "id" UUID NOT NULL,
    "scope" "PricingScope" NOT NULL,
    "property_id" UUID,
    "room_id" UUID,
    "tenancy_id" UUID,
    "rent_amount" DECIMAL(19,0),
    "electricity_unit_price" DECIMAL(19,0),
    "water_unit_price" DECIMAL(19,0),
    "trash_fee" DECIMAL(19,0),
    "internet_fee" DECIMAL(19,0),
    "service_fee" DECIMAL(19,0),
    "utility_closing_day" INTEGER,
    "due_day" INTEGER,
    "currency_code" TEXT,
    "timezone" TEXT,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pricing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_configs_scope_is_active_idx" ON "pricing_configs"("scope", "is_active");

-- CreateIndex
CREATE INDEX "pricing_configs_property_id_effective_from_effective_to_idx" ON "pricing_configs"("property_id", "effective_from", "effective_to");

-- CreateIndex
CREATE INDEX "pricing_configs_room_id_effective_from_effective_to_idx" ON "pricing_configs"("room_id", "effective_from", "effective_to");

-- CreateIndex
CREATE INDEX "pricing_configs_tenancy_id_effective_from_effective_to_idx" ON "pricing_configs"("tenancy_id", "effective_from", "effective_to");

-- AddForeignKey
ALTER TABLE "pricing_configs" ADD CONSTRAINT "pricing_configs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_configs" ADD CONSTRAINT "pricing_configs_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_configs" ADD CONSTRAINT "pricing_configs_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
