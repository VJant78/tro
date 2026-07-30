import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.POSTGRES_INVOICE_USAGE_REPORT === "1";
const invoiceReport = describe.skipIf(!enabled);

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  roomId: string;
  billingYear: number;
  billingMonth: number | null;
  items: Array<{
    itemType: string;
    quantity: string;
    unit: string | null;
    unitPrice: string;
    amount: string;
    utilityUsage: {
      previous: string;
      current: string;
      usage: string;
      unit: "kWh" | "m3";
      unitPrice: string;
      amount: string;
    } | null;
    utilityUsageSource: "INVOICE_SNAPSHOT" | "LEGACY_FINALIZED_READING" | null;
  }>;
}

interface Fixture {
  propertyAId: string;
  propertyBId: string;
  roomP1Id: string;
  roomP2Id: string;
  roomB1Id: string;
  snapshotInvoiceId: string;
  legacyValidInvoiceId: string;
  legacyMismatchInvoiceId: string;
  p1JulyInvoiceId: string;
  p2JuneInvoiceId: string;
  b1JuneInvoiceId: string;
  p1JuneInvoiceNumbers: string[];
  excludedInvoiceNumbers: string[];
}

invoiceReport("P6-005 PostgreSQL invoice usage and room report", () => {
  let app: INestApplication;
  let prisma: import("../../apps/api/src/database/prisma.service.js").PrismaService;
  let sessions: import("../../apps/api/src/auth/session.service.js").SessionService;
  let ownerUserId: string;
  let fixture: Fixture;
  const createdPropertyIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = "development";
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
    if (!owner) throw new Error("Seeded owner user is required for P6-005 E2E");
    ownerUserId = owner.id;
    fixture = await createFixture();
  });

  afterAll(async () => {
    if (prisma) {
      while (createdPropertyIds.length > 0) {
        await cleanupProperty(createdPropertyIds.pop() as string);
      }
    }
    await app?.close();
  });

  it("returns typed electricity and water snapshots without exposing raw metadata", async () => {
    const cookie = await sessionCookie(fixture.propertyAId);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${fixture.snapshotInvoiceId}`)
      .set("Cookie", cookie)
      .expect(200)
      .expect("Cache-Control", /private, no-store/);
    const invoice = response.body as InvoiceDetail;

    expect(invoice).toEqual(
      expect.objectContaining({
        id: fixture.snapshotInvoiceId,
        roomId: fixture.roomP1Id,
        billingYear: 2026,
        billingMonth: 6,
      }),
    );
    expect(usageItem(invoice, "ELECTRICITY")).toEqual(
      expect.objectContaining({
        quantity: "25",
        unit: "kWh",
        unitPrice: "3500",
        amount: "87500",
        utilityUsage: {
          previous: "120",
          current: "145",
          usage: "25",
          unit: "kWh",
          unitPrice: "3500",
          amount: "87500",
        },
        utilityUsageSource: "INVOICE_SNAPSHOT",
      }),
    );
    expect(usageItem(invoice, "WATER")).toEqual(
      expect.objectContaining({
        quantity: "5",
        unit: "m3",
        unitPrice: "15000",
        amount: "75000",
        utilityUsage: {
          previous: "30",
          current: "35",
          usage: "5",
          unit: "m3",
          unitPrice: "15000",
          amount: "75000",
        },
        utilityUsageSource: "INVOICE_SNAPSHOT",
      }),
    );

    expect(response.body).not.toHaveProperty("propertyId");
    expect(response.body).not.toHaveProperty("pricingSnapshot");
    for (const item of response.body.items as Array<Record<string, unknown>>) {
      expect(item).not.toHaveProperty("metadata");
    }
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("P6-005-RAW-METADATA-SECRET");
    expect(serialized).not.toContain("P6-005-PRICING-SECRET");
  });

  it("filters JSON and CSV reports by room identity and billing period", async () => {
    const cookie = await sessionCookie(fixture.propertyAId);
    const query = `billingYear=2026&billingMonth=6&roomId=${fixture.roomP1Id}&limit=100`;

    const report = await request(app.getHttpServer())
      .get(`/api/v1/reports/monthly?${query}`)
      .set("Cookie", cookie)
      .expect(200)
      .expect("Cache-Control", /private, no-store/);
    const invoices = report.body.invoices as Array<{
      id: string;
      roomId: string;
      billingYear: number;
      billingMonth: number;
    }>;

    expect(invoices.map(({ id }) => id).sort()).toEqual(
      [
        fixture.snapshotInvoiceId,
        fixture.legacyValidInvoiceId,
        fixture.legacyMismatchInvoiceId,
      ].sort(),
    );
    expect(
      invoices.every(
        (invoice) =>
          invoice.roomId === fixture.roomP1Id &&
          invoice.billingYear === 2026 &&
          invoice.billingMonth === 6,
      ),
    ).toBe(true);

    const csv = await request(app.getHttpServer())
      .get(`/api/v1/reports/monthly.csv?${query}`)
      .set("Cookie", cookie)
      .expect(200)
      .expect("Content-Type", /text\/csv/)
      .expect("Cache-Control", /private, no-store/);
    for (const invoiceNumber of fixture.p1JuneInvoiceNumbers) {
      expect(csv.text).toContain(invoiceNumber);
    }
    for (const invoiceNumber of fixture.excludedInvoiceNumbers) {
      expect(csv.text).not.toContain(invoiceNumber);
    }
  });

  it("returns 404 for unknown and cross-property invoice or room identities", async () => {
    const cookie = await sessionCookie(fixture.propertyAId);
    const unknownId = randomUUID();

    await request(app.getHttpServer())
      .get(`/api/v1/invoices/${unknownId}`)
      .set("Cookie", cookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/invoices/${fixture.b1JuneInvoiceId}`)
      .set("Cookie", cookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `/api/v1/reports/monthly?billingYear=2026&billingMonth=6&roomId=${unknownId}`,
      )
      .set("Cookie", cookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `/api/v1/reports/monthly?billingYear=2026&billingMonth=6&roomId=${fixture.roomB1Id}`,
      )
      .set("Cookie", cookie)
      .expect(404);
  });

  it("uses only a valid legacy reading fallback and leaves all read models unchanged", async () => {
    const cookie = await sessionCookie(fixture.propertyAId);
    const before = await readModelFingerprint();

    const validResponse = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${fixture.legacyValidInvoiceId}`)
      .set("Cookie", cookie)
      .expect(200);
    const valid = validResponse.body as InvoiceDetail;
    expect(usageItem(valid, "ELECTRICITY")).toEqual(
      expect.objectContaining({
        amount: "90000",
        utilityUsage: {
          previous: "200",
          current: "230",
          usage: "30",
          unit: "kWh",
          unitPrice: "3000",
          amount: "90000",
        },
        utilityUsageSource: "LEGACY_FINALIZED_READING",
      }),
    );

    const mismatchResponse = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${fixture.legacyMismatchInvoiceId}`)
      .set("Cookie", cookie)
      .expect(200);
    const mismatch = mismatchResponse.body as InvoiceDetail;
    expect(usageItem(mismatch, "ELECTRICITY")).toEqual(
      expect.objectContaining({
        amount: "90000",
        utilityUsage: null,
        utilityUsageSource: null,
      }),
    );

    await request(app.getHttpServer())
      .get(
        `/api/v1/reports/monthly?billingYear=2026&billingMonth=6&roomId=${fixture.roomP1Id}&limit=100`,
      )
      .set("Cookie", cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get(
        `/api/v1/reports/monthly.csv?billingYear=2026&billingMonth=6&roomId=${fixture.roomP1Id}&limit=100`,
      )
      .set("Cookie", cookie)
      .expect(200);

    expect(await readModelFingerprint()).toEqual(before);
  });

  async function createFixture(): Promise<Fixture> {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const propertyAId = randomUUID();
    const propertyBId = randomUUID();
    await prisma.property.createMany({
      data: [
        {
          id: propertyAId,
          ownerUserId,
          code: `P65005-A-${suffix}`,
          name: `P6-005 Property A ${suffix}`,
        },
        {
          id: propertyBId,
          ownerUserId,
          code: `P65005-B-${suffix}`,
          name: `P6-005 Property B ${suffix}`,
        },
      ],
    });
    createdPropertyIds.push(propertyAId, propertyBId);

    const roomP1Id = randomUUID();
    const roomP2Id = randomUUID();
    const roomB1Id = randomUUID();
    await prisma.room.createMany({
      data: [
        roomData(roomP1Id, propertyAId, `P1-${suffix}`),
        roomData(roomP2Id, propertyAId, `P2-${suffix}`),
        roomData(roomB1Id, propertyBId, `B1-${suffix}`),
      ],
    });

    const p1 = await createOccupancy(propertyAId, roomP1Id, `P1 ${suffix}`);
    const p2 = await createOccupancy(propertyAId, roomP2Id, `P2 ${suffix}`);
    const b1 = await createOccupancy(propertyBId, roomB1Id, `B1 ${suffix}`);

    const snapshotInvoice = await createInvoice(p1, {
      label: `SNAP-${suffix}`,
      billingYear: 2026,
      billingMonth: 6,
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      issuedOn: "2026-07-02",
      totalAmount: "762500",
      items: [
        rentItem("600000"),
        snapshotUtilityItem(
          "ELECTRICITY",
          randomUUID(),
          "120",
          "145",
          "25",
          "kWh",
          "3500",
          "87500",
        ),
        snapshotUtilityItem(
          "WATER",
          randomUUID(),
          "30",
          "35",
          "5",
          "m3",
          "15000",
          "75000",
        ),
      ],
      pricingSnapshot: {
        internalMarker: "P6-005-PRICING-SECRET",
      },
    });

    const legacyReading = await createReading(p1, {
      periodStart: "2026-06-01",
      periodEnd: "2026-06-29",
      electricityPrevious: "200",
      electricityCurrent: "230",
      waterPrevious: "40",
      waterCurrent: "44",
    });
    const validSettlement = await createSettlement(p1, legacyReading.id, {
      periodStart: "2026-06-01",
      periodEnd: "2026-06-29",
      billingYear: 2026,
      billingMonth: 6,
    });
    const legacyValidInvoice = await createInvoice(p1, {
      label: `LEGACY-VALID-${suffix}`,
      billingYear: 2026,
      billingMonth: 6,
      periodStart: "2026-06-01",
      periodEnd: "2026-06-29",
      issuedOn: "2026-06-30",
      totalAmount: "690000",
      sourceKey: `settlement:${validSettlement.id}`,
      items: [rentItem("600000"), legacyElectricityItem()],
    });

    const mismatchReading = await createReading(p1, {
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      billingYear: 2026,
      billingMonth: 7,
      electricityPrevious: "230",
      electricityCurrent: "260",
      waterPrevious: "44",
      waterCurrent: "48",
    });
    const mismatchSettlement = await createSettlement(p1, mismatchReading.id, {
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      billingYear: 2026,
      billingMonth: 7,
    });
    const legacyMismatchInvoice = await createInvoice(p1, {
      label: `LEGACY-MISMATCH-${suffix}`,
      billingYear: 2026,
      billingMonth: 6,
      periodStart: "2026-06-02",
      periodEnd: "2026-06-30",
      issuedOn: "2026-06-30",
      totalAmount: "690000",
      sourceKey: `settlement:${mismatchSettlement.id}`,
      items: [rentItem("600000"), legacyElectricityItem()],
    });

    const p1JulyInvoice = await createInvoice(p1, {
      label: `P1-JULY-${suffix}`,
      billingYear: 2026,
      billingMonth: 7,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      issuedOn: "2026-07-31",
      totalAmount: "600000",
      items: [rentItem("600000")],
    });
    const p2JuneInvoice = await createInvoice(p2, {
      label: `P2-JUNE-${suffix}`,
      billingYear: 2026,
      billingMonth: 6,
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      issuedOn: "2026-06-30",
      totalAmount: "500000",
      items: [rentItem("500000")],
    });
    const b1JuneInvoice = await createInvoice(b1, {
      label: `B1-JUNE-${suffix}`,
      billingYear: 2026,
      billingMonth: 6,
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      issuedOn: "2026-06-30",
      totalAmount: "400000",
      items: [rentItem("400000")],
    });

    return {
      propertyAId,
      propertyBId,
      roomP1Id,
      roomP2Id,
      roomB1Id,
      snapshotInvoiceId: snapshotInvoice.id,
      legacyValidInvoiceId: legacyValidInvoice.id,
      legacyMismatchInvoiceId: legacyMismatchInvoice.id,
      p1JulyInvoiceId: p1JulyInvoice.id,
      p2JuneInvoiceId: p2JuneInvoice.id,
      b1JuneInvoiceId: b1JuneInvoice.id,
      p1JuneInvoiceNumbers: [
        snapshotInvoice.invoiceNumber,
        legacyValidInvoice.invoiceNumber,
        legacyMismatchInvoice.invoiceNumber,
      ],
      excludedInvoiceNumbers: [
        p1JulyInvoice.invoiceNumber,
        p2JuneInvoice.invoiceNumber,
        b1JuneInvoice.invoiceNumber,
      ],
    };
  }

  async function createOccupancy(
    propertyId: string,
    roomId: string,
    label: string,
  ) {
    const tenant = await prisma.tenant.create({
      data: { propertyId, fullName: `Nguoi thue ${label}` },
    });
    const tenancy = await prisma.tenancy.create({
      data: {
        roomId,
        representativeTenantId: tenant.id,
        status: "ACTIVE",
        startDate: date("2026-06-01"),
        billingCycleType: "MONTHLY",
        rentAmount: "600000",
        members: {
          create: {
            tenantId: tenant.id,
            joinedOn: date("2026-06-01"),
            isRepresentative: true,
          },
        },
      },
    });
    return { propertyId, roomId, tenantId: tenant.id, tenancyId: tenancy.id };
  }

  async function createReading(
    occupancy: Occupancy,
    input: {
      periodStart: string;
      periodEnd: string;
      billingYear?: number;
      billingMonth?: number;
      electricityPrevious: string;
      electricityCurrent: string;
      waterPrevious: string;
      waterCurrent: string;
    },
  ) {
    const electricityUsage = decimalDifference(
      input.electricityCurrent,
      input.electricityPrevious,
    );
    const waterUsage = decimalDifference(
      input.waterCurrent,
      input.waterPrevious,
    );
    return prisma.utilityReading.create({
      data: {
        roomId: occupancy.roomId,
        tenancyId: occupancy.tenancyId,
        readingKind: "MONTHLY",
        billingPeriodStart: date(input.periodStart),
        billingPeriodEnd: date(input.periodEnd),
        billingYear: input.billingYear ?? 2026,
        billingMonth: input.billingMonth ?? 6,
        electricityPrevious: input.electricityPrevious,
        electricityCurrent: input.electricityCurrent,
        electricityUsage,
        electricityUnitPrice: "3000",
        electricityAmount: String(Number(electricityUsage) * 3000),
        waterPrevious: input.waterPrevious,
        waterCurrent: input.waterCurrent,
        waterUsage,
        waterUnitPrice: "15000",
        waterAmount: String(Number(waterUsage) * 15000),
        status: "FINALIZED",
        finalizedAt: new Date("2026-07-01T02:00:00.000Z"),
      },
    });
  }

  async function createSettlement(
    occupancy: Occupancy,
    utilityReadingId: string,
    period: {
      periodStart: string;
      periodEnd: string;
      billingYear: number;
      billingMonth: number;
    },
  ) {
    return prisma.settlement.create({
      data: {
        settlementType: "MONTHLY",
        status: "FINALIZED",
        roomId: occupancy.roomId,
        tenancyId: occupancy.tenancyId,
        representativeTenantId: occupancy.tenantId,
        utilityReadingId,
        periodStart: date(period.periodStart),
        periodEnd: date(period.periodEnd),
        billingYear: period.billingYear,
        billingMonth: period.billingMonth,
        occupiedDays: Number(period.periodEnd.slice(-2)),
        daysInMonth: Number(period.periodEnd.slice(-2)),
        rentAmount: "600000",
        proratedRentAmount: "600000",
        electricityAmount: "90000",
        waterAmount: "60000",
        totalAmount: "750000",
        outstandingAmount: "750000",
        finalizedAt: new Date("2026-07-01T03:00:00.000Z"),
      },
    });
  }

  async function createInvoice(
    occupancy: Occupancy,
    input: {
      label: string;
      billingYear: number;
      billingMonth: number;
      periodStart: string;
      periodEnd: string;
      issuedOn: string;
      totalAmount: string;
      sourceKey?: string;
      pricingSnapshot?: Record<string, unknown>;
      items: InvoiceItemInput[];
    },
  ) {
    return prisma.invoice.create({
      data: {
        invoiceNumber: `INV-P65005-${input.label}`,
        propertyId: occupancy.propertyId,
        roomId: occupancy.roomId,
        tenancyId: occupancy.tenancyId,
        payerTenantId: occupancy.tenantId,
        invoiceType: "COMBINED",
        status: "ISSUED",
        billingPeriodStart: date(input.periodStart),
        billingPeriodEnd: date(input.periodEnd),
        billingYear: input.billingYear,
        billingMonth: input.billingMonth,
        issuedOn: date(input.issuedOn),
        dueOn: date("2026-07-05"),
        totalAmount: input.totalAmount,
        outstandingAmount: input.totalAmount,
        sourceKey: input.sourceKey,
        pricingSnapshot: input.pricingSnapshot,
        items: { create: input.items },
      },
    });
  }

  async function readModelFingerprint() {
    const invoiceIds = [
      fixture.snapshotInvoiceId,
      fixture.legacyValidInvoiceId,
      fixture.legacyMismatchInvoiceId,
    ];
    const [invoices, settlements, readings, auditCount] = await Promise.all([
      prisma.invoice.findMany({
        where: { id: { in: invoiceIds } },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          outstandingAmount: true,
          pricingSnapshot: true,
          updatedAt: true,
          items: {
            select: { id: true, metadata: true, updatedAt: true },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { id: "asc" },
      }),
      prisma.settlement.findMany({
        where: { roomId: fixture.roomP1Id },
        select: {
          id: true,
          status: true,
          utilityReadingId: true,
          updatedAt: true,
        },
        orderBy: { id: "asc" },
      }),
      prisma.utilityReading.findMany({
        where: { roomId: fixture.roomP1Id },
        select: {
          id: true,
          status: true,
          finalizedAt: true,
          updatedAt: true,
        },
        orderBy: { id: "asc" },
      }),
      prisma.auditLog.count({
        where: { entityId: { in: invoiceIds } },
      }),
    ]);
    return JSON.parse(
      JSON.stringify({ invoices, settlements, readings, auditCount }),
    ) as unknown;
  }

  async function cleanupProperty(propertyId: string) {
    const rooms = await prisma.room.findMany({
      where: { propertyId },
      select: { id: true },
    });
    const roomIds = rooms.map(({ id }) => id);
    const tenancies = await prisma.tenancy.findMany({
      where: { roomId: { in: roomIds } },
      select: { id: true },
    });
    const tenancyIds = tenancies.map(({ id }) => id);
    const tenants = await prisma.tenant.findMany({
      where: { propertyId },
      select: { id: true },
    });
    const tenantIds = tenants.map(({ id }) => id);
    const invoices = await prisma.invoice.findMany({
      where: { propertyId },
      select: { id: true },
    });
    const invoiceIds = invoices.map(({ id }) => id);

    await prisma.$transaction(async (tx) => {
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
      await tx.tenancyMember.deleteMany({
        where: { tenancyId: { in: tenancyIds } },
      });
      await tx.tenancy.deleteMany({ where: { id: { in: tenancyIds } } });
      await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await tx.room.deleteMany({ where: { id: { in: roomIds } } });
      await tx.property.deleteMany({ where: { id: propertyId } });
    });
  }

  async function sessionCookie(propertyId: string) {
    const session = await sessions.createSession({
      userId: ownerUserId,
      role: "OWNER",
      propertyId,
    });
    return `tro_session=${session.sessionToken}`;
  }
});

interface Occupancy {
  propertyId: string;
  roomId: string;
  tenantId: string;
  tenancyId: string;
}

interface InvoiceItemInput {
  itemType: "RENT" | "ELECTRICITY" | "WATER";
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
  sortOrder: number;
  metadata?: Record<string, unknown>;
}

function roomData(id: string, propertyId: string, code: string) {
  return {
    id,
    propertyId,
    code,
    name: `Phong ${code}`,
    status: "OCCUPIED" as const,
    defaultRentAmount: "600000",
    currentRentStartedOn: date("2026-06-01"),
  };
}

function rentItem(amount: string): InvoiceItemInput {
  return {
    itemType: "RENT",
    description: "Tien phong thang 6/2026",
    quantity: "30",
    unit: "ngay",
    unitPrice: "20000",
    amount,
    sortOrder: 10,
  };
}

function legacyElectricityItem(): InvoiceItemInput {
  return {
    itemType: "ELECTRICITY",
    description: "Tien dien",
    quantity: "1",
    unit: "ky",
    unitPrice: "90000",
    amount: "90000",
    sortOrder: 20,
  };
}

function snapshotUtilityItem(
  itemType: "ELECTRICITY" | "WATER",
  sourceUtilityReadingId: string,
  previous: string,
  current: string,
  usage: string,
  unit: "kWh" | "m3",
  unitPrice: string,
  amount: string,
): InvoiceItemInput {
  return {
    itemType,
    description: itemType === "ELECTRICITY" ? "Tien dien" : "Tien nuoc",
    quantity: usage,
    unit,
    unitPrice,
    amount,
    sortOrder: itemType === "ELECTRICITY" ? 20 : 30,
    metadata: {
      schemaVersion: 1,
      sourceUtilityReadingId,
      utilityUsage: { previous, current, usage, unit, unitPrice, amount },
      internalMarker: "P6-005-RAW-METADATA-SECRET",
    },
  };
}

function usageItem(invoice: InvoiceDetail, itemType: string) {
  const item = invoice.items.find(
    (candidate) => candidate.itemType === itemType,
  );
  expect(item).toBeDefined();
  return item;
}

function decimalDifference(current: string, previous: string) {
  return String(Number(current) - Number(previous));
}

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
