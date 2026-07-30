import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.POSTGRES_PROPERTY_SCOPE === "1";
const scope = describe.skipIf(!enabled);
const ownerUserId = "00000000-0000-4000-8000-000000000001";
const defaultPropertyId = "00000000-0000-4000-8000-000000000002";

scope("PostgreSQL property authorization", () => {
  let app: INestApplication;
  let prisma: import("../../apps/api/src/database/prisma.service.js").PrismaService;
  let sessions: import("../../apps/api/src/auth/session.service.js").SessionService;
  const propertyId = randomUUID();
  const defaultRoomId = randomUUID();
  const scopedRoomId = randomUUID();
  const defaultTenantId = randomUUID();
  const scopedTenantId = randomUUID();
  const suffix = randomUUID().slice(0, 8).toUpperCase();

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

    await prisma.property.create({
      data: {
        id: propertyId,
        ownerUserId,
        code: `SCOPE-${suffix}`,
        name: `Nha tro scope ${suffix}`,
      },
    });
    await prisma.room.createMany({
      data: [
        {
          id: defaultRoomId,
          propertyId: defaultPropertyId,
          code: `DEFAULT-${suffix}`,
          name: "Phong property mac dinh",
        },
        {
          id: scopedRoomId,
          propertyId,
          code: `SCOPED-${suffix}`,
          name: "Phong property thu hai",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: defaultTenantId,
          propertyId: defaultPropertyId,
          fullName: `Nguoi mac dinh ${suffix}`,
          identityNumber: `D${suffix}`,
        },
        {
          id: scopedTenantId,
          propertyId,
          fullName: `Nguoi scope ${suffix}`,
          phone: "0999999999",
          identityNumber: `S${suffix}`,
          permanentAddress: "Dia chi can mask",
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.tenant.deleteMany({
      where: { id: { in: [defaultTenantId, scopedTenantId] } },
    });
    await prisma.room.deleteMany({
      where: { id: { in: [defaultRoomId, scopedRoomId] } },
    });
    await prisma.property.delete({ where: { id: propertyId } });
    await app.close();
  });

  it("lists and mutates resources only inside the session property", async () => {
    const defaultCookie = await sessionCookie(defaultPropertyId, "OWNER");
    const scopedCookie = await sessionCookie(propertyId, "OWNER");

    const defaultRooms = await request(app.getHttpServer())
      .get("/api/v1/rooms?limit=100&sort=code:asc")
      .set("Cookie", defaultCookie)
      .expect(200);
    expect(
      defaultRooms.body.data.map((room: { id: string }) => room.id),
    ).toContain(defaultRoomId);
    expect(
      defaultRooms.body.data.map((room: { id: string }) => room.id),
    ).not.toContain(scopedRoomId);

    const scopedRooms = await request(app.getHttpServer())
      .get("/api/v1/rooms?limit=100&sort=code:asc")
      .set("Cookie", scopedCookie)
      .expect(200);
    expect(
      scopedRooms.body.data.map((room: { id: string }) => room.id),
    ).toContain(scopedRoomId);
    expect(
      scopedRooms.body.data.map((room: { id: string }) => room.id),
    ).not.toContain(defaultRoomId);

    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${defaultTenantId}`)
      .set("Cookie", scopedCookie)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/rooms/${defaultRoomId}`)
      .set("Cookie", scopedCookie)
      .send({ name: "Khong duoc sua" })
      .expect(404);
  });

  it("masks PII for a viewer inside the authorized property", async () => {
    const viewerCookie = await sessionCookie(propertyId, "VIEWER");
    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${scopedTenantId}`)
      .set("Cookie", viewerCookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.fullName).toContain("Nguoi scope");
        expect(body.phone).toBeNull();
        expect(body.identityNumber).toBeNull();
        expect(body.permanentAddress).toBeNull();
      });
  });

  async function sessionCookie(
    propertyIdForSession: string,
    role: "OWNER" | "VIEWER",
  ) {
    const session = await sessions.createSession({
      userId: ownerUserId,
      role,
      propertyId: propertyIdForSession,
    });
    return `tro_session=${session.sessionToken}`;
  }
});
