# Database Design — Phase 1

## Scope

Thiet ke schema cho he thong quan ly va tinh tien phong tro, uu tien tinh dung dan du lieu tai chinh, khong mat lich su, idempotency va auditability.

Stack de xuat: PostgreSQL + Prisma. Cac constraint nang cao nhu partial unique index, exclusion constraint va check phuc tap co the can raw SQL migration.

## Common conventions

- Primary key: UUID.
- Thoi diem he thong: `timestamptz`.
- Ngay nghiep vu: `date`.
- Soft delete: `deleted_at`.
- Audit fields: `created_at`, `updated_at`, `created_by_user_id`, `updated_by_user_id` khi co ngu canh.
- Tien: `numeric(19,0)` cho VND hoac `Decimal @db.Decimal(19, 0)` trong Prisma; khong dung floating-point.
- Chi so dien nuoc: `numeric(14,3)`.
- `paid_until` la exclusive boundary.
- Billing period: `billing_period_start` inclusive, `billing_period_end` exclusive, kem `billing_year`, `billing_month`, `billing_label`.

## Enums

- `UserRole`: `OWNER`, `MANAGER`, `STAFF`, `VIEWER`.
- `RoomStatus`: `VACANT`, `OCCUPIED`, `MAINTENANCE`, `INACTIVE`.
- `TenantStatus`: `ACTIVE`, `LEFT`, `INACTIVE`.
- `TenancyStatus`: `DRAFT`, `ACTIVE`, `ENDED`, `CANCELLED`.
- `BillingCycleType`: `DAILY`, `WEEKLY`, `MONTHLY`.
- `PricingScope`: `SYSTEM`, `PROPERTY`, `ROOM`, `TENANCY`.
- `UtilityReadingStatus`: `DRAFT`, `FINALIZED`, `VOIDED`.
- `UtilityReadingKind`: `MONTHLY`, `MOVE_OUT`.
- `SettlementType`: `MONTHLY`, `MOVE_OUT`.
- `SettlementStatus`: `DRAFT`, `FINALIZED`, `VOIDED`.
- `AccountEntryType`: `PREPAYMENT`, `CREDIT_APPLIED`.
- `InvoiceType`: `RENT`, `UTILITY`, `COMBINED`, `ADJUSTMENT`.
- `InvoiceStatus`: `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `CANCELLED`.
- `InvoiceItemType`: `RENT`, `ELECTRICITY`, `WATER`, `TRASH`, `INTERNET`, `SERVICE`, `SURCHARGE`, `DISCOUNT`, `ADJUSTMENT`, `PREVIOUS_DEBT`.
- `PaymentMethod`: `CASH`, `BANK_TRANSFER`, `OTHER`.
- `PaymentStatus`: `PENDING`, `CONFIRMED`, `VOIDED`, `REFUNDED`.
- `HandoverType`: `MOVE_IN`, `MOVE_OUT`, `TRANSFER`, `METER_REPLACEMENT`.
- `AuditAction`: `CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `STATUS_CHANGE`, `ISSUE_INVOICE`, `CONFIRM_PAYMENT`, `VOID_PAYMENT`, `ADJUST_DEBT`, `FINALIZE_READING`, `CHANGE_PRICING`.

## Core entities

### users

- Fields: `id`, `email`, `phone`, `password_hash`, `full_name`, `role`, `is_active`, `last_login_at`, audit fields.
- Constraints: unique `email` where not deleted; unique nullable `phone` where not deleted.
- Security: never store plain password; do not log password hash.

### properties

- Fields: `id`, `name`, `code`, `address`, `owner_user_id`, `notes`, audit fields.
- Relations: owner user, many room groups, many rooms.
- Constraints: unique `(owner_user_id, code)` where not deleted.

### room_groups

- Fields: `id`, `property_id`, `name`, `code`, `description`, `sort_order`, audit fields.
- Constraints: unique `(property_id, code)` where not deleted.

### rooms

- Fields: `id`, `property_id`, `room_group_id`, `code`, `name`, `room_type`, `status`, `default_rent_amount`, `default_billing_cycle_type`, `default_billing_cycle_count`, `max_occupants`, `current_tenancy_id`, `current_rent_started_on`, `rent_paid_until`, `deposit_amount`, `notes`, audit fields.
- Constraints: unique `(property_id, code)` where not deleted; amounts `>= 0`; `max_occupants > 0`; cycle count `> 0`.
- Indexes: `(property_id, status)`, `(room_group_id, status)`, `current_tenancy_id`, `rent_paid_until`, search on `code/name`.
- Rule: rooms with financial history cannot be hard-deleted.

### tenants

- Fields: `id`, `full_name`, `phone`, `date_of_birth`, `gender`, `identity_number`, `identity_issued_on`, `identity_issued_at`, `permanent_address`, `hometown`, `vehicle_plate`, emergency contact, `identity_document_url`, `notes`, `status`, audit fields.
- Constraints: unique nullable `identity_number` where not deleted.
- Indexes: `phone`, `identity_number`, `full_name`, `status`.
- Security: identity number and document URL are sensitive.

### tenancies

- Fields: `id`, `room_id`, `representative_tenant_id`, `status`, `start_date`, `expected_end_date`, `actual_end_date`, `billing_cycle_type`, `billing_cycle_count`, `billing_anchor_day`, `rent_amount`, `rent_paid_until`, `deposit_amount`, `pricing_config_id`, `notes`, audit fields.
- Constraints: amount `>= 0`; cycle count `> 0`; monthly anchor 1..31; end date not before start date.
- Important constraint: partial unique `(room_id)` where status active and not deleted.
- Recommended: exclusion constraint on date range to prevent overlapping tenancy history.

### tenancy_members

- Fields: `id`, `tenancy_id`, `tenant_id`, `role`, `joined_on`, `left_on`, `is_representative`, audit fields.
- Constraints: unique `(tenancy_id, tenant_id)` where not deleted; one representative per tenancy; one active membership per tenant; `left_on >= joined_on`.

### pricing_configs

- Fields: scope target, electricity/water prices, minimum usage flags, fixed water fee, trash, internet, service fee, utility closing day, due day, currency, rounding, timezone, effective dates, active flag, audit fields.
- Constraints: prices and fees `>= 0`; closing/due day 1..31; target must match scope; no overlapping active effective period per target.

### room_pricing_overrides

- Fields: `room_id`, rent cycle/amount, utility prices, fixed fees, effective dates, active flag, notes, audit fields.
- Purpose: room-specific pricing layer.
- Constraints: prices and fees `>= 0`; no overlapping active period per room.

### utility_readings

- Fields: `room_id`, `tenancy_id`, period fields, previous/current/usage electricity, electricity unit price/amount, previous/current/usage water, water unit price/amount, status, recorder, recorded/finalized timestamps, notes, audit fields.
- Constraints: current reading `>=` previous reading; generated or validated usage; unique finalized reading per `(room_id, billing_period_start, billing_period_end)`.
- Rule: editing finalized reading requires audit; locked/paid invoices need adjustment instead of direct edit.

### settlements

- Fields: `settlement_type`, `status`, `room_id`, `tenancy_id`, `representative_tenant_id`, optional `utility_reading_id`, inclusive period start/end, billing year/month, occupied days, days in month, rent amount snapshot, prorated rent, electricity amount, water amount, total, prepaid applied, carry-forward, outstanding, finalized timestamp, notes, audit fields.
- Purpose: Phase 4 settlement foundation for monthly close and move-out close before the full invoice module.
- Rule: duplicate finalized settlement for the same tenancy and period is rejected by application logic.
- Rule: rent proration uses actual days in the month and stores the rounded VND amount.

### tenant_account_entries

- Fields: `tenant_id`, optional `tenancy_id`, optional `room_id`, optional `settlement_id`, `entry_type`, amount, effective date, notes, audit fields.
- Purpose: track prepayment credit and the portion applied to rent.
- Rule: `PREPAYMENT` increases credit balance; `CREDIT_APPLIED` decreases credit balance. Credit is applied only to rent in Phase 4.

### invoices

- Fields: `invoice_number`, `property_id`, `room_id`, `tenancy_id`, `payer_tenant_id`, `invoice_type`, `status`, period fields, `issued_on`, `due_on`, `total_amount`, `paid_amount`, `outstanding_amount`, `fully_paid_at`, `locked_at`, `cancelled_at`, `source_key`, `idempotency_key`, `pricing_snapshot`, notes, audit fields.
- Constraints: unique invoice number; amounts `>= 0`; `paid_amount <= total_amount`; period end after start.
- Duplicate prevention: partial unique `(room_id, invoice_type, billing_period_start, billing_period_end)` where not deleted and not cancelled; unique nullable `source_key`.

### invoice_items

- Fields: `invoice_id`, `item_type`, `description`, `quantity`, `unit`, `unit_price`, `amount`, `sort_order`, `metadata`, audit fields.
- Constraints: quantity `>= 0`; unit price `>= 0` except controlled adjustment; invoice total cannot become negative.
- Rule: unit prices are snapshots at invoice creation time.

### payments

- Fields: `payment_number`, `property_id`, `room_id`, `payer_tenant_id`, `amount`, `method`, `status`, `paid_at`, confirmer, `external_transaction_id`, `idempotency_key`, description, void metadata, audit fields.
- Constraints: unique payment number; amount `> 0`; unique nullable idempotency key; unique nullable external transaction id.
- Rule: no hard delete; void/reversal changes status and triggers recalculation.

### payment_allocations

- Fields: `payment_id`, `invoice_id`, `amount`, `allocated_at`, audit fields.
- Constraints: unique `(payment_id, invoice_id)` where not deleted; amount `> 0`; allocation sums cannot exceed payment amount or invoice outstanding unless overpayment is approved later.
- Rule: MVP may allocate one payment to one invoice while keeping this table for future multi-invoice allocation.

### room_handover_records

- Fields: `room_id`, `tenancy_id`, `handover_type`, `handover_at`, electricity/water reading, deposit amount, notes, performer, from/to tenant, audit fields.
- Purpose: move-in, move-out, transfer and meter replacement history.

### audit_logs

- Fields: `actor_user_id`, `action`, `entity_type`, `entity_id`, `old_values`, `new_values`, `metadata`, `ip_address`, `user_agent`, `created_at`.
- Rule: append-only through normal application path; mask sensitive values.
- Indexes: `(entity_type, entity_id)`, `(actor_user_id, created_at)`, `(action, created_at)`.

### system_settings

- Fields: `key`, `value`, `value_type`, `description`, `is_sensitive`, audit fields.
- Constraints: unique key where not deleted.
- Initial settings: timezone, currency, rounding rule, utility closing day, payment due day, default utility prices and fees.
- Rule: do not store secrets here without encryption and explicit access control.

## Critical constraints

- Active room code unique: `(property_id, code)` on rooms where `deleted_at is null`.
- One active tenancy per room: unique `(room_id)` where `status = ACTIVE and deleted_at is null`.
- One active tenant membership: unique `(tenant_id)` where `left_on is null and deleted_at is null`.
- One finalized utility reading per room/period.
- One active invoice per room/type/period.
- Payment idempotency via unique `idempotency_key` and optional unique `external_transaction_id`.

## Transaction boundaries

Required DB transactions:

- Create recurring invoice.
- Finalize utility reading and create linked invoice.
- Confirm payment and allocate it.
- Update invoice status and `paid_until`.
- Void payment and recalculate financial state.
- Transfer room or end tenancy.
- Write audit log for financial mutations.

## Migration notes

- Phase 1 has no production data migration.
- Future migrations touching finance need backup, dry-run checks, forward-compatible deploy order and rollback notes.
