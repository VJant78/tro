CREATE UNIQUE INDEX "utility_readings_one_finalized_per_room_period_kind"
ON "utility_readings"("room_id", "billing_period_start", "billing_period_end", "reading_kind")
WHERE "status" = 'FINALIZED' AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "settlements_one_finalized_per_tenancy_period_type"
ON "settlements"("tenancy_id", "period_start", "period_end", "settlement_type")
WHERE "status" = 'FINALIZED' AND "deleted_at" IS NULL;
