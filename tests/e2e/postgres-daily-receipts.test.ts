import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.POSTGRES_DAILY_RECEIPTS === "1";
const receipts = describe.skipIf(!enabled);
const receivedAt = "2026-07-29T03:00:00.000Z";

interface Fixture {
  propertyId: string;
  roomId: string;
  tenantId: string;
  tenancyId: string;
  invoiceIds: string[];
}

interface ReceiptPreview {
  previewToken: string;
  allocations: Array<{ invoiceId: string; amount: string }>;
  creditCreated: string;
  creditBalanceAfter: string;
}

interface ReceiptResult {
  receipt: { id: string; status: string; canVoid: boolean };
  allocations: Array<{ id: string; invoiceId: string; amount: string }>;
  creditCreated: string;
  creditBalanceAfter: string;
  replayed: boolean;
}

receipts("P6-004 PostgreSQL daily receipt flow", () => {
  let app: INestApplication;
  let prisma: import("../../apps/api/src/database/prisma.service.js").PrismaService;
  let sessions: import("../../apps/api/src/auth/session.service.js").SessionService;
  let ownerUserId: string;
  const fixtures: Fixture[] = [];
  const testUserIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = "development";
    process.env.RECEIPT_PREVIEW_SECRET ??=
      "p6-004-postgres-e2e-preview-secret-at-least-32-characters";
    const [{ createApiApp }, { PrismaService }, { SessionService }] =
      await Promise.all([
        import("../../apps/api/src/main.js"),
        import("../../apps/api/src/database/prisma.service.js"),
        import("../../apps/api/src/auth/session.service.js"),
      ]);
    app = await createApiApp();
    await app.init();
    prisma = app.get(PrismaService);
    sessions = app.get(SessionService);
    const owner = await prisma.user.findUnique({
      where: { email: "owner@example.local" },
      select: { id: true },
    });
    if (!owner) throw new Error("Seeded owner user is required for P6-004 E2E");
    ownerUserId = owner.id;
    await cleanupStaleFixtures();
  });

  afterEach(async () => {
    while (fixtures.length > 0) {
      await cleanupFixture(fixtures.pop() as Fixture);
    }
    while (testUserIds.length > 0) {
      await prisma.user.delete({ where: { id: testUserIds.pop() as string } });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it("allocates partial and multi-invoice receipts by FIFO, then carries credit", async () => {
    const fixture = await createFixture(["300000", "400000"]);
    const ownerCookie = await sessionCookie(fixture.propertyId, "OWNER");

    const first = await previewAndConfirm(
      fixture,
      ownerCookie,
      { amount: "200000", method: "CASH", receivedAt },
      randomUUID(),
    );
    expect(first.allocations).toEqual([
      expect.objectContaining({
        invoiceId: fixture.invoiceIds[0],
        amount: "200000",
      }),
    ]);
    expect(first.creditCreated).toBe("0");

    const second = await previewAndConfirm(
      fixture,
      ownerCookie,
      { amount: "600000", method: "BANK_TRANSFER", receivedAt },
      randomUUID(),
    );
    expect(
      second.allocations.map(({ invoiceId, amount }) => ({
        invoiceId,
        amount,
      })),
    ).toEqual([
      { invoiceId: fixture.invoiceIds[0], amount: "100000" },
      { invoiceId: fixture.invoiceIds[1], amount: "400000" },
    ]);
    expect(second.creditCreated).toBe("100000");
    expect(second.creditBalanceAfter).toBe("100000");

    const noDebt = await previewAndConfirm(
      fixture,
      ownerCookie,
      { amount: "30000", method: "OTHER", receivedAt },
      randomUUID(),
    );
    expect(noDebt.allocations).toEqual([]);
    expect(noDebt.creditCreated).toBe("30000");
    expect(noDebt.creditBalanceAfter).toBe("130000");

    const invoices = await prisma.invoice.findMany({
      where: { id: { in: fixture.invoiceIds } },
      orderBy: { billingPeriodStart: "asc" },
    });
    expect(invoices.map((invoice) => invoice.status)).toEqual(["PAID", "PAID"]);
    expect(
      invoices.map((invoice) => invoice.outstandingAmount.toString()),
    ).toEqual(["0", "0"]);

    const history = await request(app.getHttpServer())
      .get(`/api/v1/tenancies/${fixture.tenancyId}/receipts?limit=2`)
      .set("Cookie", ownerCookie)
      .expect(200);
    expect(history.body.data).toHaveLength(2);
    expect(history.body.page.hasMore).toBe(true);
    expect(history.body.summary).toEqual({
      creditBalance: "130000",
      receiptCount: 3,
    });
  });

  it("replays the same command, rejects a reused key, and leaves stale preview at zero writes", async () => {
    const fixture = await createFixture(["500000"]);
    const ownerCookie = await sessionCookie(fixture.propertyId, "OWNER");
    const intent = { amount: "100000", method: "CASH", receivedAt };
    const preview = await previewReceipt(fixture, ownerCookie, intent);
    const key = randomUUID();
    const first = await confirmReceipt(
      fixture,
      ownerCookie,
      intent,
      preview.previewToken,
      key,
    );
    const replay = await confirmReceipt(
      fixture,
      ownerCookie,
      intent,
      preview.previewToken,
      key,
    );
    expect(replay.receipt.id).toBe(first.receipt.id);
    expect(replay.replayed).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts`)
      .set("Cookie", ownerCookie)
      .set("Idempotency-Key", key)
      .send({ ...intent, amount: "100001", previewToken: preview.previewToken })
      .expect(409)
      .expect(({ body }) => expectErrorCode(body, "IDEMPOTENCY_KEY_REUSED"));

    const staleIntent = { amount: "50000", method: "CASH", receivedAt };
    const stalePreview = await previewReceipt(
      fixture,
      ownerCookie,
      staleIntent,
    );
    await previewAndConfirm(
      fixture,
      ownerCookie,
      { amount: "25000", method: "CASH", receivedAt },
      randomUUID(),
    );
    const before = await financialCounts(fixture.tenancyId);
    await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts`)
      .set("Cookie", ownerCookie)
      .set("Idempotency-Key", randomUUID())
      .send({ ...staleIntent, previewToken: stalePreview.previewToken })
      .expect(409)
      .expect(({ body }) => expectErrorCode(body, "ALLOCATION_PREVIEW_STALE"));
    expect(await financialCounts(fixture.tenancyId)).toEqual(before);
  });

  it("enforces role, property, receipt date, and payer membership boundaries", async () => {
    const fixture = await createFixture([]);
    const other = await createFixture([]);
    const ownerCookie = await sessionCookie(fixture.propertyId, "OWNER");
    const staffCookie = await sessionCookie(fixture.propertyId, "STAFF");
    const viewerCookie = await sessionCookie(fixture.propertyId, "VIEWER");
    const otherOwnerCookie = await sessionCookie(other.propertyId, "OWNER");
    const intent = { amount: "30000", method: "CASH", receivedAt };

    await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts/preview`)
      .set("Cookie", viewerCookie)
      .send(intent)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts/preview`)
      .set("Cookie", otherOwnerCookie)
      .send(intent)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts/preview`)
      .set("Cookie", ownerCookie)
      .send({ ...intent, receivedAt: "2026-04-30T03:00:00.000Z" })
      .expect(422)
      .expect(({ body }) => expectErrorCode(body, "RECEIPT_DATE_OUT_OF_RANGE"));
    await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts/preview`)
      .set("Cookie", ownerCookie)
      .send({ ...intent, receivedAt: "2100-01-01T03:00:00.000Z" })
      .expect(422)
      .expect(({ body }) => expectErrorCode(body, "RECEIPT_DATE_OUT_OF_RANGE"));
    await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts/preview`)
      .set("Cookie", ownerCookie)
      .send({ ...intent, payerTenantId: other.tenantId })
      .expect(422)
      .expect(({ body }) => expectErrorCode(body, "RECEIPT_PAYER_NOT_ACTIVE"));

    const collected = await previewAndConfirm(
      fixture,
      staffCookie,
      { ...intent, payerTenantId: fixture.tenantId },
      randomUUID(),
    );
    await request(app.getHttpServer())
      .post(`/api/v1/receipts/${collected.receipt.id}/void`)
      .set("Cookie", staffCookie)
      .set("Idempotency-Key", randomUUID())
      .send({ reason: "Thu nham" })
      .expect(403);
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { id: collected.receipt.id },
        select: { status: true },
      }),
    ).toEqual({ status: "CONFIRMED" });
  });

  it("serializes concurrent retries and prevents different keys from over-allocating", async () => {
    const sameKeyFixture = await createFixture(["100000"]);
    const sameCookie = await sessionCookie(sameKeyFixture.propertyId, "OWNER");
    const intent = { amount: "100000", method: "CASH", receivedAt };
    const samePreview = await previewReceipt(
      sameKeyFixture,
      sameCookie,
      intent,
    );
    const sameKey = randomUUID();
    const sameResults = await Promise.all(
      [0, 1].map(() =>
        rawConfirm(
          sameKeyFixture,
          sameCookie,
          intent,
          samePreview.previewToken,
          sameKey,
        ),
      ),
    );
    expect(sameResults.map((result) => result.status).sort()).toEqual([
      201, 201,
    ]);
    expect(
      new Set(sameResults.map((result) => result.body.receipt.id)).size,
    ).toBe(1);
    expect((await financialCounts(sameKeyFixture.tenancyId)).payments).toBe(1);

    const differentKeyFixture = await createFixture(["100000"]);
    const differentCookie = await sessionCookie(
      differentKeyFixture.propertyId,
      "OWNER",
    );
    const differentPreview = await previewReceipt(
      differentKeyFixture,
      differentCookie,
      intent,
    );
    const differentResults = await Promise.all(
      [randomUUID(), randomUUID()].map((key) =>
        rawConfirm(
          differentKeyFixture,
          differentCookie,
          intent,
          differentPreview.previewToken,
          key,
        ),
      ),
    );
    expect(differentResults.map((result) => result.status).sort()).toEqual([
      201, 409,
    ]);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: differentKeyFixture.invoiceIds[0] },
    });
    expect(invoice.paidAmount.toString()).toBe("100000");
    expect(invoice.outstandingAmount.toString()).toBe("0");
    expect(
      (await financialCounts(differentKeyFixture.tenancyId)).payments,
    ).toBe(1);
  });

  it("applies credit to a gross settlement invoice and voids by immutable cascade", async () => {
    const fixture = await createFixture([]);
    const ownerCookie = await sessionCookie(fixture.propertyId, "OWNER");
    const collected = await previewAndConfirm(
      fixture,
      ownerCookie,
      { amount: "700000", method: "CASH", receivedAt },
      randomUUID(),
    );
    const settlement = await prisma.settlement.create({
      data: {
        settlementType: "MONTHLY",
        status: "FINALIZED",
        roomId: fixture.roomId,
        tenancyId: fixture.tenancyId,
        representativeTenantId: fixture.tenantId,
        periodStart: date("2026-07-01"),
        periodEnd: date("2026-07-31"),
        billingYear: 2026,
        billingMonth: 7,
        occupiedDays: 31,
        daysInMonth: 31,
        rentAmount: "1000000",
        proratedRentAmount: "1000000",
        totalAmount: "1000000",
        outstandingAmount: "1000000",
        finalizedAt: new Date(receivedAt),
      },
    });

    const invoiceResponse = await request(app.getHttpServer())
      .post("/api/v1/invoices/from-settlement")
      .set("Cookie", ownerCookie)
      .send({ settlementId: settlement.id })
      .expect(201);
    fixture.invoiceIds.push(invoiceResponse.body.id);
    expect(invoiceResponse.body).toEqual(
      expect.objectContaining({
        totalAmount: "1000000",
        paidAmount: "700000",
        outstandingAmount: "300000",
        status: "PARTIALLY_PAID",
      }),
    );
    const appliedSettlement = await prisma.settlement.findUniqueOrThrow({
      where: { id: settlement.id },
    });
    expect(appliedSettlement.prepaidAppliedAmount.toString()).toBe("700000");
    expect(appliedSettlement.outstandingAmount.toString()).toBe("300000");

    const allocationCount = await prisma.paymentAllocation.count({
      where: { paymentId: collected.receipt.id },
    });
    const journalCount = await prisma.tenantAccountEntry.count({
      where: { sourcePaymentId: collected.receipt.id },
    });
    const voidKey = randomUUID();
    const voided = await request(app.getHttpServer())
      .post(`/api/v1/receipts/${collected.receipt.id}/void`)
      .set("Cookie", ownerCookie)
      .set("Idempotency-Key", voidKey)
      .send({ reason: "Ghi nhan nham so tien" })
      .expect(201);
    expect(voided.body.receipt.status).toBe("VOIDED");
    expect(voided.body.creditBalanceAfter).toBe("0");

    const reopened = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceResponse.body.id },
    });
    expect(reopened.paidAmount.toString()).toBe("0");
    expect(reopened.outstandingAmount.toString()).toBe("1000000");
    expect(reopened.status).toBe("ISSUED");
    expect(
      await prisma.paymentAllocation.count({
        where: { paymentId: collected.receipt.id },
      }),
    ).toBe(allocationCount);
    expect(
      await prisma.tenantAccountEntry.count({
        where: { sourcePaymentId: collected.receipt.id },
      }),
    ).toBe(journalCount * 2);

    const replayedVoid = await request(app.getHttpServer())
      .post(`/api/v1/receipts/${collected.receipt.id}/void`)
      .set("Cookie", ownerCookie)
      .set("Idempotency-Key", voidKey)
      .send({ reason: "Ghi nhan nham so tien" })
      .expect(201);
    expect(replayedVoid.body.replayed).toBe(true);
  });

  it("reports receipt cash once and a void as a negative cash event", async () => {
    const fixture = await createFixture([]);
    const ownerCookie = await sessionCookie(fixture.propertyId, "OWNER");
    const collected = await previewAndConfirm(
      fixture,
      ownerCookie,
      { amount: "500000", method: "CASH", receivedAt },
      randomUUID(),
    );
    await request(app.getHttpServer())
      .post(`/api/v1/receipts/${collected.receipt.id}/void`)
      .set("Cookie", ownerCookie)
      .set("Idempotency-Key", randomUUID())
      .send({ reason: "Dao giao dich de doi soat" })
      .expect(201);

    const report = await request(app.getHttpServer())
      .get("/api/v1/reports/monthly?billingYear=2026&billingMonth=7")
      .set("Cookie", ownerCookie)
      .expect(200);
    expect(report.body.totals).toEqual(
      expect.objectContaining({
        cashReceived: "500000",
        cashReversed: "500000",
        collected: "0",
      }),
    );
    expect(report.body.payments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: collected.receipt.id, status: "VOIDED" }),
      ]),
    );
  });

  it("keeps legacy invoice payment on the oldest FIFO debt", async () => {
    const fixture = await createFixture(["100000", "100000"]);
    const ownerCookie = await sessionCookie(fixture.propertyId, "OWNER");
    await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set("Cookie", ownerCookie)
      .set("Idempotency-Key", randomUUID())
      .send({
        invoiceId: fixture.invoiceIds[1],
        amount: "100000",
        method: "CASH",
        paidAt: receivedAt,
      })
      .expect(422);
    expect(
      await prisma.payment.count({ where: { tenancyId: fixture.tenancyId } }),
    ).toBe(0);
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: fixture.invoiceIds[0] },
        })
      ).outstandingAmount.toString(),
    ).toBe("100000");
  });

  it("binds idempotency replay to the actor and masks receipt PII for VIEWER", async () => {
    const fixture = await createFixture([]);
    const actorBId = await createTestUser("Actor B");
    const actorACookie = await sessionCookie(fixture.propertyId, "OWNER");
    const actorBCookie = await sessionCookie(
      fixture.propertyId,
      "MANAGER",
      actorBId,
    );
    const viewerCookie = await sessionCookie(
      fixture.propertyId,
      "VIEWER",
      actorBId,
    );
    const intent = {
      amount: "30000",
      method: "CASH",
      receivedAt,
      payerTenantId: fixture.tenantId,
      notes: "Ghi chu rieng cua nguoi thu",
    };
    const preview = await previewReceipt(fixture, actorACookie, intent);
    const key = randomUUID();
    const collected = await confirmReceipt(
      fixture,
      actorACookie,
      intent,
      preview.previewToken,
      key,
    );

    await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts`)
      .set("Cookie", actorBCookie)
      .set("Idempotency-Key", key)
      .send({ ...intent, previewToken: preview.previewToken })
      .expect(409)
      .expect(({ body }) => expectErrorCode(body, "IDEMPOTENCY_KEY_REUSED"));

    await request(app.getHttpServer())
      .post(`/api/v1/receipts/${collected.receipt.id}/void`)
      .set("Cookie", actorACookie)
      .set("Idempotency-Key", randomUUID())
      .send({ reason: "Ly do huy co thong tin rieng" })
      .expect(201);

    const history = await request(app.getHttpServer())
      .get(`/api/v1/tenancies/${fixture.tenancyId}/receipts`)
      .set("Cookie", viewerCookie)
      .expect(200);
    expectViewerReceiptMasked(history.body.data[0]);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/receipts/${collected.receipt.id}`)
      .set("Cookie", viewerCookie)
      .expect(200);
    expectViewerReceiptMasked(detail.body.receipt);
    expect(detail.body.recordedByUserId).toBeNull();
    expect(detail.body.reversal).toEqual(
      expect.objectContaining({ reason: null }),
    );
  });

  it("serializes concurrent receipt confirmation and void without a lost update", async () => {
    const fixture = await createFixture(["100000", "100000"]);
    const ownerCookie = await sessionCookie(fixture.propertyId, "OWNER");
    const oldReceipt = await previewAndConfirm(
      fixture,
      ownerCookie,
      { amount: "100000", method: "CASH", receivedAt },
      randomUUID(),
    );
    const nextIntent = {
      amount: "100000",
      method: "CASH",
      receivedAt,
    };
    const nextPreview = await previewReceipt(fixture, ownerCookie, nextIntent);

    const [confirmResult, voidResult] = await Promise.all([
      rawConfirm(
        fixture,
        ownerCookie,
        nextIntent,
        nextPreview.previewToken,
        randomUUID(),
      ),
      rawVoid(oldReceipt.receipt.id, ownerCookie, randomUUID()),
    ]);
    expect([201, 409]).toContain(confirmResult.status);
    expect(voidResult.status).toBe(201);

    const invoices = await prisma.invoice.findMany({
      where: { id: { in: fixture.invoiceIds } },
    });
    const confirmed = await prisma.payment.findMany({
      where: {
        tenancyId: fixture.tenancyId,
        sourceType: "DAILY_RECEIPT",
        status: "CONFIRMED",
      },
    });
    const confirmedCash = sumMoney(confirmed.map(({ amount }) => amount));
    const outstanding = sumMoney(
      invoices.map(({ outstandingAmount }) => outstandingAmount),
    );
    expect(outstanding).toBe(200000n - confirmedCash);
    expect(await accountBalance(fixture.tenancyId)).toBe(0n);
    await expectNoOverdrawnLots(fixture.tenancyId);
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { id: oldReceipt.receipt.id },
        select: { status: true },
      }),
    ).toEqual({ status: "VOIDED" });
  });

  it("serializes a receipt with settlement invoice credit application", async () => {
    const fixture = await createFixture([]);
    const ownerCookie = await sessionCookie(fixture.propertyId, "OWNER");
    await previewAndConfirm(
      fixture,
      ownerCookie,
      { amount: "100000", method: "CASH", receivedAt },
      randomUUID(),
    );
    const settlement = await createFinalizedSettlement(fixture, "100000");
    const nextIntent = {
      amount: "50000",
      method: "BANK_TRANSFER",
      receivedAt,
    };
    const nextPreview = await previewReceipt(fixture, ownerCookie, nextIntent);

    const [confirmResult, invoiceResult] = await Promise.all([
      rawConfirm(
        fixture,
        ownerCookie,
        nextIntent,
        nextPreview.previewToken,
        randomUUID(),
      ),
      request(app.getHttpServer())
        .post("/api/v1/invoices/from-settlement")
        .set("Cookie", ownerCookie)
        .send({ settlementId: settlement.id }),
    ]);
    expect([201, 409]).toContain(confirmResult.status);
    expect(invoiceResult.status).toBe(201);
    fixture.invoiceIds.push(invoiceResult.body.id as string);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceResult.body.id as string },
    });
    const confirmed = await prisma.payment.findMany({
      where: {
        tenancyId: fixture.tenancyId,
        sourceType: "DAILY_RECEIPT",
        status: "CONFIRMED",
      },
    });
    const confirmedCash = sumMoney(confirmed.map(({ amount }) => amount));
    expect(invoice.paidAmount.toString()).toBe("100000");
    expect(invoice.outstandingAmount.toString()).toBe("0");
    expect(await accountBalance(fixture.tenancyId)).toBe(
      confirmedCash - 100000n,
    );
    expect(await accountBalance(fixture.tenancyId)).toBeGreaterThanOrEqual(0n);
    await expectNoOverdrawnLots(fixture.tenancyId);
  });

  it("voids source-lotted credit after whole-room transfer and reopens the source invoice", async () => {
    const fixture = await createFixture([]);
    const ownerCookie = await sessionCookie(fixture.propertyId, "OWNER");
    const targetRoom = await prisma.room.create({
      data: {
        propertyId: fixture.propertyId,
        code: `TARGET-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "Phong dich P6",
        status: "VACANT",
        defaultRentAmount: "1000000",
      },
    });
    await prisma.pricingConfig.create({
      data: {
        scope: "PROPERTY",
        propertyId: fixture.propertyId,
        rentAmount: "1000000",
        electricityUnitPrice: "0",
        waterUnitPrice: "0",
        effectiveFrom: date("2026-01-01"),
      },
    });
    const collected = await previewAndConfirm(
      fixture,
      ownerCookie,
      { amount: "2000000", method: "CASH", receivedAt },
      randomUUID(),
    );
    const transferKey = randomUUID();
    const transfer = await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/transfer`)
      .set("Cookie", ownerCookie)
      .set("Idempotency-Key", transferKey)
      .send({
        idempotencyKey: transferKey,
        toRoomId: targetRoom.id,
        transferDate: "2026-07-30",
        handoverReadings: {
          electricityPrevious: "0",
          electricityCurrent: "0",
          waterPrevious: "0",
          waterCurrent: "0",
        },
        prepaidAmount: "0",
      })
      .expect(201);
    expect(transfer.body.operation.status).toBe("COMPLETED");
    const targetTenancyId = transfer.body.transfer.targetTenancyId as string;
    const invoiceId = transfer.body.invoice.id as string;
    fixture.invoiceIds.push(invoiceId);
    expect(await accountBalance(targetTenancyId)).toBeGreaterThan(0n);

    await request(app.getHttpServer())
      .post(`/api/v1/receipts/${collected.receipt.id}/void`)
      .set("Cookie", ownerCookie)
      .set("Idempotency-Key", randomUUID())
      .send({ reason: "Dao thu sau khi chuyen phong" })
      .expect(201);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.paidAmount.toString()).toBe("0");
    expect(invoice.outstandingAmount.toString()).toBe(
      invoice.totalAmount.toString(),
    );
    expect(invoice.status).toBe("ISSUED");
    expect(await accountBalance(fixture.tenancyId)).toBe(0n);
    expect(await accountBalance(targetTenancyId)).toBe(0n);
    await expectNoOverdrawnLots(fixture.tenancyId);
    await expectNoOverdrawnLots(targetTenancyId);
  });

  it("rolls back every financial write when the journal boundary fails", async () => {
    const fixture = await createFixture([]);
    const ownerCookie = await sessionCookie(fixture.propertyId, "OWNER");
    const intent = { amount: "30000", method: "CASH", receivedAt };
    const preview = await previewReceipt(fixture, ownerCookie, intent);
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `p6_fail_journal_${suffix}`;
    const triggerName = `p6_fail_journal_trigger_${suffix}`;
    const beforeAuditCount = await prisma.auditLog.count();

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        IF NEW.tenancy_id = '${fixture.tenancyId}'::uuid THEN
          RAISE EXCEPTION 'P6 injected journal failure' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "tenant_account_entries"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
    `);
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts`)
        .set("Cookie", ownerCookie)
        .set("Idempotency-Key", randomUUID())
        .send({ ...intent, previewToken: preview.previewToken })
        .expect(500);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "tenant_account_entries"`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS "${functionName}"()`,
      );
    }

    expect(await financialCounts(fixture.tenancyId)).toEqual({
      payments: 0,
      allocations: 0,
      entries: 0,
      operations: 0,
    });
    expect(await prisma.auditLog.count()).toBe(beforeAuditCount);
  });

  async function createFixture(amounts: string[]): Promise<Fixture> {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const property = await prisma.property.create({
      data: {
        ownerUserId,
        code: `P6-${suffix}`,
        name: `P6-004 ${suffix}`,
      },
    });
    const room = await prisma.room.create({
      data: {
        propertyId: property.id,
        code: `R-${suffix}`,
        name: `Phong P6 ${suffix}`,
        status: "OCCUPIED",
        defaultRentAmount: "1000000",
        currentRentStartedOn: date("2026-05-01"),
      },
    });
    const tenant = await prisma.tenant.create({
      data: {
        propertyId: property.id,
        fullName: `Nguoi thue P6 ${suffix}`,
      },
    });
    const tenancy = await prisma.tenancy.create({
      data: {
        roomId: room.id,
        representativeTenantId: tenant.id,
        status: "ACTIVE",
        startDate: date("2026-05-01"),
        billingCycleType: "MONTHLY",
        rentAmount: "1000000",
        members: {
          create: {
            tenantId: tenant.id,
            joinedOn: date("2026-05-01"),
            isRepresentative: true,
          },
        },
      },
    });
    const invoiceIds: string[] = [];
    for (const [index, amount] of amounts.entries()) {
      const month = index === 0 ? 5 : 6;
      const monthText = String(month).padStart(2, "0");
      const periodEnd = month === 5 ? "31" : "30";
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-P6-${suffix}-${monthText}`,
          propertyId: property.id,
          roomId: room.id,
          tenancyId: tenancy.id,
          payerTenantId: tenant.id,
          invoiceType: "COMBINED",
          status: "ISSUED",
          billingPeriodStart: date(`2026-${monthText}-01`),
          billingPeriodEnd: date(`2026-${monthText}-${periodEnd}`),
          billingYear: 2026,
          billingMonth: month,
          issuedOn: date(`2026-${monthText}-${periodEnd}`),
          dueOn: date(`2026-${String(month + 1).padStart(2, "0")}-05`),
          totalAmount: amount,
          outstandingAmount: amount,
          sourceKey: `p6-e2e:${suffix}:${month}`,
        },
      });
      invoiceIds.push(invoice.id);
    }
    const fixture = {
      propertyId: property.id,
      roomId: room.id,
      tenantId: tenant.id,
      tenancyId: tenancy.id,
      invoiceIds,
    };
    fixtures.push(fixture);
    return fixture;
  }

  async function createTestUser(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const user = await prisma.user.create({
      data: {
        email: `p6-${suffix}@example.local`,
        passwordHash: "test-only-not-a-real-password-hash",
        fullName: `${label} ${suffix}`,
        role: "MANAGER",
      },
    });
    testUserIds.push(user.id);
    return user.id;
  }

  async function createFinalizedSettlement(fixture: Fixture, amount: string) {
    return prisma.settlement.create({
      data: {
        settlementType: "MONTHLY",
        status: "FINALIZED",
        roomId: fixture.roomId,
        tenancyId: fixture.tenancyId,
        representativeTenantId: fixture.tenantId,
        periodStart: date("2026-07-01"),
        periodEnd: date("2026-07-31"),
        billingYear: 2026,
        billingMonth: 7,
        occupiedDays: 31,
        daysInMonth: 31,
        rentAmount: amount,
        proratedRentAmount: amount,
        totalAmount: amount,
        outstandingAmount: amount,
        finalizedAt: new Date(receivedAt),
      },
    });
  }

  async function accountBalance(tenancyId: string) {
    const entries = await prisma.tenantAccountEntry.findMany({
      where: { tenancyId, deletedAt: null },
      select: { amount: true, direction: true },
    });
    return entries.reduce(
      (balance, entry) =>
        balance +
        (entry.direction === "CREDIT"
          ? BigInt(entry.amount.toString())
          : -BigInt(entry.amount.toString())),
      0n,
    );
  }

  async function expectNoOverdrawnLots(tenancyId: string) {
    const lots = await prisma.tenantAccountEntry.findMany({
      where: {
        tenancyId,
        direction: "CREDIT",
        journalType: { in: ["RECEIPT_CREDIT", "TRANSFER_IN"] },
        deletedAt: null,
      },
      include: { lotConsumptions: { where: { deletedAt: null } } },
    });
    for (const lot of lots) {
      const netConsumed = lot.lotConsumptions.reduce(
        (total, entry) =>
          total +
          (entry.direction === "DEBIT"
            ? BigInt(entry.amount.toString())
            : -BigInt(entry.amount.toString())),
        0n,
      );
      expect(netConsumed).toBeGreaterThanOrEqual(0n);
      expect(netConsumed).toBeLessThanOrEqual(BigInt(lot.amount.toString()));
    }
  }

  async function cleanupFixture(fixture: Fixture) {
    await cleanupProperty(fixture.propertyId);
  }

  async function cleanupStaleFixtures() {
    const staleProperties = await prisma.property.findMany({
      where: {
        code: { startsWith: "P6-" },
        name: { startsWith: "P6-004 " },
      },
      select: { id: true },
    });
    for (const property of staleProperties) {
      await cleanupProperty(property.id);
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_append_only"',
      );
      await tx.$executeRawUnsafe(`
        DELETE FROM "audit_logs" a
        WHERE a."created_at" >= CURRENT_TIMESTAMP - INTERVAL '1 day'
          AND (
            (a."entity_type" IN ('receipt', 'payment')
              AND NOT EXISTS (SELECT 1 FROM "payments" p WHERE p."id"::text = a."entity_id"))
            OR (a."entity_type" IN ('invoice', 'invoice_credit_application')
              AND NOT EXISTS (SELECT 1 FROM "invoices" i WHERE i."id"::text = a."entity_id"))
            OR (a."entity_type" = 'settlement'
              AND NOT EXISTS (SELECT 1 FROM "settlements" s WHERE s."id"::text = a."entity_id"))
          )
      `);
      await tx.$executeRawUnsafe(
        'ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_append_only"',
      );
    });
  }

  async function cleanupProperty(propertyId: string) {
    const [rooms, tenants, tenancies, payments, settlements, invoices] =
      await Promise.all([
        prisma.room.findMany({
          where: { propertyId },
          select: { id: true },
        }),
        prisma.tenant.findMany({
          where: { propertyId },
          select: { id: true },
        }),
        prisma.tenancy.findMany({
          where: { room: { propertyId } },
          select: { id: true },
        }),
        prisma.payment.findMany({
          where: { propertyId },
          select: { id: true },
        }),
        prisma.settlement.findMany({
          where: { room: { propertyId } },
          select: { id: true },
        }),
        prisma.invoice.findMany({
          where: { propertyId },
          select: { id: true },
        }),
      ]);
    const roomIds = rooms.map(({ id }) => id);
    const tenantIds = tenants.map(({ id }) => id);
    const tenancyIds = tenancies.map(({ id }) => id);
    const paymentIds = payments.map(({ id }) => id);
    const invoiceIds = invoices.map(({ id }) => id);
    const entityIds = [
      propertyId,
      ...roomIds,
      ...tenantIds,
      ...tenancyIds,
      ...paymentIds,
      ...settlements.map(({ id }) => id),
      ...invoiceIds,
    ];

    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE "tenant_account_entries" DISABLE TRIGGER "tenant_account_entries_v2_append_only"',
        );
        await tx.$executeRawUnsafe(
          'ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_append_only"',
        );
        await tx.auditLog.deleteMany({
          where: { entityId: { in: entityIds } },
        });
        await tx.tenantAccountEntry.deleteMany({ where: { propertyId } });
        await tx.paymentOperation.deleteMany({ where: { propertyId } });
        await tx.paymentAllocation.deleteMany({
          where: { paymentId: { in: paymentIds } },
        });
        await tx.payment.deleteMany({ where: { propertyId } });
        await tx.tenancyOperation.deleteMany({ where: { propertyId } });
        await tx.invoiceItem.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
        await tx.invoice.deleteMany({ where: { propertyId } });
        await tx.settlement.deleteMany({
          where: { tenancyId: { in: tenancyIds } },
        });
        await tx.utilityReading.deleteMany({
          where: { roomId: { in: roomIds } },
        });
        await tx.tenancyRepresentativeChange.deleteMany({
          where: { tenancyId: { in: tenancyIds } },
        });
        await tx.roomHandoverRecord.deleteMany({
          where: { roomId: { in: roomIds } },
        });
        await tx.tenancyMember.deleteMany({
          where: { tenancyId: { in: tenancyIds } },
        });
        await tx.pricingConfig.deleteMany({ where: { propertyId } });
        await tx.tenancy.deleteMany({ where: { id: { in: tenancyIds } } });
        await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
        await tx.room.deleteMany({ where: { id: { in: roomIds } } });
        await tx.roomGroup.deleteMany({ where: { propertyId } });
        await tx.property.delete({ where: { id: propertyId } });
        await tx.$executeRawUnsafe(
          'ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_append_only"',
        );
        await tx.$executeRawUnsafe(
          'ALTER TABLE "tenant_account_entries" ENABLE TRIGGER "tenant_account_entries_v2_append_only"',
        );
      },
      { timeout: 30_000 },
    );
  }

  async function sessionCookie(
    propertyId: string,
    role: "OWNER" | "MANAGER" | "STAFF" | "VIEWER",
    actorUserId = ownerUserId,
  ) {
    const session = await sessions.createSession({
      userId: actorUserId,
      role,
      propertyId,
    });
    return `tro_session=${session.sessionToken}`;
  }

  async function previewReceipt(
    fixture: Fixture,
    cookie: string,
    intent: {
      amount: string;
      method: string;
      receivedAt: string;
      payerTenantId?: string;
    },
  ) {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts/preview`)
      .set("Cookie", cookie)
      .send(intent)
      .expect(201);
    return response.body as ReceiptPreview;
  }

  async function confirmReceipt(
    fixture: Fixture,
    cookie: string,
    intent: {
      amount: string;
      method: string;
      receivedAt: string;
      payerTenantId?: string;
    },
    previewToken: string,
    key: string,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts`)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send({ ...intent, previewToken })
      .expect(201);
    return response.body as ReceiptResult;
  }

  async function previewAndConfirm(
    fixture: Fixture,
    cookie: string,
    intent: {
      amount: string;
      method: string;
      receivedAt: string;
      payerTenantId?: string;
    },
    key: string,
  ) {
    const preview = await previewReceipt(fixture, cookie, intent);
    return confirmReceipt(fixture, cookie, intent, preview.previewToken, key);
  }

  async function rawConfirm(
    fixture: Fixture,
    cookie: string,
    intent: { amount: string; method: string; receivedAt: string },
    previewToken: string,
    key: string,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tenancies/${fixture.tenancyId}/receipts`)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send({ ...intent, previewToken });
    return { status: response.status, body: response.body as ReceiptResult };
  }

  async function rawVoid(receiptId: string, cookie: string, key: string) {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/receipts/${receiptId}/void`)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send({ reason: "Huy de kiem tra race" });
    return { status: response.status, body: response.body as ReceiptResult };
  }

  async function financialCounts(tenancyId: string) {
    const [payments, allocations, entries, operations] = await Promise.all([
      prisma.payment.count({ where: { tenancyId } }),
      prisma.paymentAllocation.count({ where: { payment: { tenancyId } } }),
      prisma.tenantAccountEntry.count({ where: { tenancyId } }),
      prisma.paymentOperation.count({ where: { tenancyId } }),
    ]);
    return { payments, allocations, entries, operations };
  }
});

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function sumMoney(values: Array<{ toString(): string }>) {
  return values.reduce((total, value) => total + BigInt(value.toString()), 0n);
}

function expectViewerReceiptMasked(value: unknown) {
  expect(value).toEqual(
    expect.objectContaining({
      payerTenantId: null,
      payerTenantName: null,
      notes: null,
      recordedByName: null,
      voidReason: null,
    }),
  );
}

function expectErrorCode(body: unknown, code: string) {
  expect(body).toEqual(
    expect.objectContaining({
      error: expect.objectContaining({ code }),
    }),
  );
}
