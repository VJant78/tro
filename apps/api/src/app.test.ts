import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "./main.js";

describe("API foundation", () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApiApp();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("responds to health checks", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("ok");
      });
  });

  it("describes the session policy without exposing secrets", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/auth/session-policy")
      .expect(200)
      .expect(({ body }) => {
        expect(body.httpOnly).toBe(true);
        expect(body.denyByDefault).toBe(true);
      });
  });

  it("creates a dev owner session with an HttpOnly cookie", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201)
      .expect("set-cookie", /tro_session=.*HttpOnly/)
      .expect(({ body }) => {
        expect(body.user.role).toBe("OWNER");
        expect(body.sessionToken).toBeUndefined();
      });
  });

  it("requires authentication for room lists", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/rooms")
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("UNAUTHENTICATED");
        expect(body.error.requestId).toMatch(/^req_/);
      });
  });

  it("creates, filters, updates and retires rooms", async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const created = await agent
      .post("/api/v1/rooms")
      .send({
        code: " a-101 ",
        name: "Phong A101",
        defaultRentAmount: "2500000",
        maxOccupants: 2,
      })
      .expect(201);

    expect(created.body.code).toBe("A-101");
    expect(created.body.defaultRentAmount).toBe("2500000");

    await agent
      .post("/api/v1/rooms")
      .send({ code: "A-101", name: "Duplicate" })
      .expect(409);

    await agent
      .get("/api/v1/rooms?filter[status]=VACANT&q=A-101")
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
        expect(body.page.hasMore).toBe(false);
      });

    await agent
      .patch(`/api/v1/rooms/${created.body.id}`)
      .send({ status: "MAINTENANCE", notes: "Sua may lanh" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("MAINTENANCE");
      });

    await agent.delete(`/api/v1/rooms/${created.body.id}`).expect(200);

    await agent.get(`/api/v1/rooms/${created.body.id}`).expect(404);

    await agent
      .post("/api/v1/rooms")
      .send({ code: "A-101", name: "Phong A101 moi" })
      .expect(201);
  });

  it("returns validation errors for invalid room input", async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    await agent
      .post("/api/v1/rooms")
      .send({ code: "bad space", name: "", defaultRentAmount: "-1" })
      .expect(422)
      .expect(({ body }) => {
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.details.length).toBeGreaterThan(0);
      });
  });

  it("creates tenants and manages tenancy lifecycle", async () => {
    const agent = request.agent(app.getHttpServer());
    const roomId = "00000000-0000-4000-8000-000000000201";
    const targetRoomId = "00000000-0000-4000-8000-000000000202";

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const tenant = await agent
      .post("/api/v1/tenants")
      .send({
        fullName: "Nguyen Van A",
        phone: "0900000001",
        identityNumber: "012345678901",
      })
      .expect(201);

    const coTenant = await agent
      .post("/api/v1/tenants")
      .send({
        fullName: "Tran Thi B",
        phone: "0900000002",
        identityNumber: "012345678902",
      })
      .expect(201);

    await agent
      .get("/api/v1/tenants?q=0900000001")
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
      });

    const tenancy = await agent
      .post("/api/v1/tenancies")
      .send({
        roomId,
        representativeTenantId: tenant.body.id,
        startDate: "2026-08-01",
      })
      .expect(201);

    expect(tenancy.body.membershipRole).toBe("REPRESENTATIVE");
    expect(tenancy.body.memberCount).toBe(1);

    await agent
      .post("/api/v1/tenancies")
      .send({
        roomId,
        representativeTenantId: tenant.body.id,
        startDate: "2026-08-02",
      })
      .expect(409);

    const sharedTenancy = await agent
      .post("/api/v1/tenancies")
      .send({
        roomId,
        representativeTenantId: coTenant.body.id,
        startDate: "2026-08-03",
      })
      .expect(201);

    expect(sharedTenancy.body.id).toBe(tenancy.body.id);
    expect(sharedTenancy.body.memberCount).toBe(2);
    expect(
      sharedTenancy.body.members.find(
        (member: { tenantId: string }) => member.tenantId === coTenant.body.id,
      ).role,
    ).toBe("CO_TENANT");

    await agent
      .get(`/api/v1/tenants?filter[roomId]=${roomId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(2);
      });

    const transferred = await agent
      .post(`/api/v1/tenancies/${tenancy.body.id}/transfer`)
      .send({
        toRoomId: targetRoomId,
        transferDate: "2026-08-15",
        notes: "Chuyen phong",
      })
      .expect(201);

    expect(transferred.body.roomId).toBe(targetRoomId);
    expect(transferred.body.status).toBe("ACTIVE");
    expect(transferred.body.memberCount).toBe(2);

    await agent
      .patch(`/api/v1/tenancies/${transferred.body.id}/end`)
      .send({ actualEndDate: "2026-08-31" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("ENDED");
      });
  });

  it("moves and removes individual tenancy members", async () => {
    const agent = request.agent(app.getHttpServer());
    const roomId = "00000000-0000-4000-8000-000000000211";
    const memberTargetRoomId = "00000000-0000-4000-8000-000000000212";
    const blockedTargetRoomId = "00000000-0000-4000-8000-000000000213";

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const representative = await agent
      .post("/api/v1/tenants")
      .send({
        fullName: "Le Dai Dien",
        phone: "0911000001",
        identityNumber: "022345678901",
      })
      .expect(201);
    const coTenant = await agent
      .post("/api/v1/tenants")
      .send({
        fullName: "Le O Chung",
        phone: "0911000002",
        identityNumber: "022345678902",
      })
      .expect(201);

    const tenancy = await agent
      .post("/api/v1/tenancies")
      .send({
        roomId,
        representativeTenantId: representative.body.id,
        startDate: "2026-08-01",
      })
      .expect(201);
    await agent
      .post("/api/v1/tenancies")
      .send({
        roomId,
        representativeTenantId: coTenant.body.id,
        startDate: "2026-08-02",
      })
      .expect(201);

    await agent
      .post(
        `/api/v1/tenancies/${tenancy.body.id}/members/${representative.body.id}/transfer`,
      )
      .send({
        toRoomId: blockedTargetRoomId,
        transferDate: "2026-08-10",
      })
      .expect(409);

    const movedMember = await agent
      .post(
        `/api/v1/tenancies/${tenancy.body.id}/members/${coTenant.body.id}/transfer`,
      )
      .send({
        toRoomId: memberTargetRoomId,
        transferDate: "2026-08-11",
      })
      .expect(201);

    expect(movedMember.body.roomId).toBe(memberTargetRoomId);
    expect(movedMember.body.membershipRole).toBe("REPRESENTATIVE");
    expect(movedMember.body.memberCount).toBe(1);

    await agent
      .get(`/api/v1/tenants/${coTenant.body.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.currentTenancy.roomId).toBe(memberTargetRoomId);
        expect(body.currentTenancy.role).toBe("REPRESENTATIVE");
      });

    await agent
      .patch(
        `/api/v1/tenancies/${movedMember.body.id}/members/${coTenant.body.id}/leave`,
      )
      .send({ leftOn: "2026-08-20" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("ENDED");
        expect(body.actualEndDate).toBe("2026-08-20");
      });
  });

  it("resolves pricing priority and rejects overlapping configs", async () => {
    const agent = request.agent(app.getHttpServer());
    const propertyId = "00000000-0000-4000-8000-000000000501";
    const roomId = "00000000-0000-4000-8000-000000000502";
    const tenancyId = "00000000-0000-4000-8000-000000000503";

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    await agent
      .get("/api/v1/pricing-configs/global")
      .expect(200)
      .expect(({ body }) => {
        expect(body.scope).toBe("SYSTEM");
        expect(body.electricityUnitPrice).toBe("3500");
      });

    await agent
      .patch("/api/v1/pricing-configs/global")
      .send({
        electricityUnitPrice: "4100",
        waterUnitPrice: "16000",
        trashFee: "30000",
        internetFee: "100000",
        serviceFee: "0",
        utilityClosingDay: 28,
        dueDay: 5,
        currencyCode: "VND",
        timezone: "Asia/Ho_Chi_Minh",
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.scope).toBe("SYSTEM");
        expect(body.rentAmount).toBeNull();
        expect(body.electricityUnitPrice).toBe("4100");
      });

    await agent
      .post("/api/v1/pricing-configs")
      .send({
        scope: "PROPERTY",
        propertyId,
        electricityUnitPrice: "4000",
        waterUnitPrice: "12000",
        effectiveFrom: "2026-01-01",
      })
      .expect(201);
    await agent
      .post("/api/v1/pricing-configs")
      .send({
        scope: "ROOM",
        roomId,
        rentAmount: "2500000",
        waterUnitPrice: "14000",
        effectiveFrom: "2026-01-01",
      })
      .expect(201);
    await agent
      .post("/api/v1/pricing-configs")
      .send({
        scope: "TENANCY",
        tenancyId,
        rentAmount: "3000000",
        effectiveFrom: "2026-01-01",
      })
      .expect(201);

    await agent
      .get(
        `/api/v1/pricing-configs/effective?propertyId=${propertyId}&roomId=${roomId}&tenancyId=${tenancyId}&asOf=2026-08-01`,
      )
      .expect(200)
      .expect(({ body }) => {
        expect(body.resolvedConfig.rentAmount).toBe("3000000");
        expect(body.sources.rentAmount).toBe("TENANCY");
        expect(body.resolvedConfig.waterUnitPrice).toBe("14000");
        expect(body.sources.waterUnitPrice).toBe("ROOM");
        expect(body.resolvedConfig.electricityUnitPrice).toBe("4000");
        expect(body.sources.electricityUnitPrice).toBe("PROPERTY");
        expect(body.resolvedConfig.trashFee).toBe("30000");
        expect(body.sources.trashFee).toBe("SYSTEM");
      });

    await agent
      .post("/api/v1/pricing-configs")
      .send({
        scope: "ROOM",
        roomId,
        rentAmount: "2600000",
        effectiveFrom: "2026-06-01",
      })
      .expect(409);

    await agent
      .post("/api/v1/pricing-configs")
      .send({
        scope: "SYSTEM",
        propertyId,
        effectiveFrom: "2026-01-01",
      })
      .expect(422);
  });
});
