import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingService } from "./billing/billing.service.js";
import { SessionService } from "./auth/session.service.js";
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

  it("revokes the current session on logout", async () => {
    const agent = request.agent(app.getHttpServer());

    const login = await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);
    const setCookie = login.headers["set-cookie"];
    const oldCookie = (
      Array.isArray(setCookie) ? setCookie[0] : setCookie
    )?.split(";", 1)[0];
    expect(oldCookie).toMatch(/^tro_session=/);

    await agent
      .post("/api/v1/auth/logout")
      .expect(201)
      .expect("set-cookie", /tro_session=;.*HttpOnly/)
      .expect(({ body }) => {
        expect(body.loggedOut).toBe(true);
      });

    await request(app.getHttpServer())
      .get("/api/v1/rooms")
      .set("Cookie", oldCookie ?? "")
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("UNAUTHENTICATED");
      });
  });

  it("masks tenant PII for viewer sessions", async () => {
    const owner = request.agent(app.getHttpServer());
    await owner
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);
    const tenant = await owner
      .post("/api/v1/tenants")
      .send({
        fullName: "Nguoi Co Du Lieu Rieng",
        phone: "0900000000",
        identityNumber: "099999999999",
        permanentAddress: "Dia chi rieng",
        emergencyContactName: "Nguoi lien he",
        emergencyContactPhone: "0911111111",
        notes: "Ghi chu rieng",
      })
      .expect(201);

    const session = await app.get(SessionService).createSession({
      userId: "00000000-0000-4000-8000-000000000001",
      role: "VIEWER",
    });
    const cookie = `tro_session=${session.sessionToken}`;

    await request(app.getHttpServer())
      .get("/api/v1/tenants?limit=50")
      .set("Cookie", cookie)
      .expect(200)
      .expect(({ body }) => {
        const masked = body.data.find(
          (item: { id: string }) => item.id === tenant.body.id,
        );
        expect(masked).toEqual(
          expect.objectContaining({
            phone: null,
            identityNumber: null,
            permanentAddress: null,
            emergencyContactName: null,
            emergencyContactPhone: null,
            notes: null,
          }),
        );
      });

    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenant.body.id}`)
      .set("Cookie", cookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.identityNumber).toBeNull();
        expect(body.phone).toBeNull();
        expect(body.permanentAddress).toBeNull();
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

  it("derives occupied room state and blocks maintenance while occupied", async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    await agent
      .post("/api/v1/rooms")
      .send({ code: "DERIVED-1", name: "Phong derived", status: "OCCUPIED" })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe("ROOM_STATUS_IS_DERIVED");
      });

    const room = await agent
      .post("/api/v1/rooms")
      .send({ code: "DERIVED-2", name: "Phong co nguoi" })
      .expect(201);
    const tenant = await agent
      .post("/api/v1/tenants")
      .send({ fullName: "Nguoi Dang O" })
      .expect(201);

    await agent
      .post("/api/v1/tenancies")
      .send({
        roomId: room.body.id,
        representativeTenantId: tenant.body.id,
        startDate: "2026-08-01",
      })
      .expect(201);

    await agent
      .patch(`/api/v1/rooms/${room.body.id}`)
      .send({ status: "MAINTENANCE" })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe("ROOM_HAS_ACTIVE_OCCUPANTS");
      });
  });

  it("creates tenants and manages tenancy lifecycle", async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const room = await agent
      .post("/api/v1/rooms")
      .send({
        code: "LIFE-201",
        name: "Phong lifecycle cu",
        defaultRentAmount: "3100000",
        maxOccupants: 3,
      })
      .expect(201);
    const targetRoom = await agent
      .post("/api/v1/rooms")
      .send({
        code: "LIFE-202",
        name: "Phong lifecycle moi",
        defaultRentAmount: "3200000",
        maxOccupants: 3,
      })
      .expect(201);
    const roomId = room.body.id as string;
    const targetRoomId = targetRoom.body.id as string;

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

    const transferPayload = {
      idempotencyKey: "whole-transfer-life-201",
      toRoomId: targetRoomId,
      transferDate: "2026-08-15",
      handoverReadings: {
        electricityPrevious: "0",
        electricityCurrent: "10",
        waterPrevious: "0",
        waterCurrent: "2",
      },
      prepaidAmount: "0",
      notes: "Chuyen phong",
    };
    await agent
      .post(`/api/v1/tenancies/${tenancy.body.id}/transfer`)
      .send({ toRoomId: targetRoomId })
      .expect(422)
      .expect(({ body }) => {
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.details.length).toBeGreaterThanOrEqual(3);
      });
    const transferred = await agent
      .post(`/api/v1/tenancies/${tenancy.body.id}/transfer`)
      .send(transferPayload)
      .expect(201);

    expect(transferred.body.operation.status).toBe("COMPLETED");
    expect(transferred.body.transfer.sourceTenancyId).toBe(tenancy.body.id);
    expect(transferred.body.settlement.status).toBe("FINALIZED");
    expect(transferred.body.invoice.sourceKey).toBe(
      `settlement:${transferred.body.settlement.id}`,
    );
    const targetTenancyId = transferred.body.transfer.targetTenancyId as string;

    await agent
      .post(`/api/v1/tenancies/${tenancy.body.id}/transfer`)
      .send(transferPayload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.operation.replayed).toBe(true);
        expect(body.transfer.targetTenancyId).toBe(targetTenancyId);
        expect(body.settlement.id).toBe(transferred.body.settlement.id);
        expect(body.invoice.id).toBe(transferred.body.invoice.id);
      });

    await agent
      .post(`/api/v1/tenancies/${tenancy.body.id}/transfer`)
      .send({ ...transferPayload, transferDate: "2026-08-16" })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
      });

    await agent
      .get(`/api/v1/settlements?tenancyId=${tenancy.body.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
      });
    await agent
      .get(`/api/v1/invoices?tenancyId=${tenancy.body.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
      });

    await agent
      .get("/api/v1/tenancies")
      .expect(200)
      .expect(({ body }) => {
        const moved = body.find(
          (item: { id: string }) => item.id === targetTenancyId,
        );
        expect(moved.roomId).toBe(targetRoomId);
        expect(moved.status).toBe("ACTIVE");
        expect(moved.memberCount).toBe(2);
        expect(
          moved.members.filter(
            (member: { role: string; leftOn: string | null }) =>
              member.role === "REPRESENTATIVE" && member.leftOn === null,
          ),
        ).toHaveLength(1);
      });

    await agent
      .patch(`/api/v1/tenancies/${targetTenancyId}/end`)
      .send({
        idempotencyKey: "whole-end-life-2026",
        actualEndDate: "2026-08-31",
        handoverReadings: {
          electricityPrevious: "0",
          electricityCurrent: "8",
          waterPrevious: "0",
          waterCurrent: "1",
        },
        prepaidAmount: "0",
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.operation.status).toBe("COMPLETED");
        expect(body.transfer).toBeNull();
        expect(body.settlement.status).toBe("FINALIZED");
        expect(body.invoice).not.toBeNull();
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
    const leavingCoTenant = await agent
      .post("/api/v1/tenants")
      .send({
        fullName: "Le Roi Rieng",
        phone: "0911000003",
        identityNumber: "022345678903",
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
      .post("/api/v1/tenancies")
      .send({
        roomId,
        representativeTenantId: leavingCoTenant.body.id,
        startDate: "2026-08-03",
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
      .patch(
        `/api/v1/tenancies/${tenancy.body.id}/members/${leavingCoTenant.body.id}/leave`,
      )
      .send({ leftOn: "2026-08-12" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("ACTIVE");
        expect(body.memberCount).toBe(1);
        expect(body.representativeTenantId).toBe(representative.body.id);
      });

    await agent
      .get(`/api/v1/settlements?tenancyId=${tenancy.body.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(0);
      });
    await agent
      .get(`/api/v1/invoices?tenancyId=${tenancy.body.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(0);
      });

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
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe("OLD_ROOM_SETTLEMENT_REQUIRED");
      });
  });

  it("changes the representative atomically and replays idempotently", async () => {
    const agent = request.agent(app.getHttpServer());
    const roomId = "00000000-0000-4000-8000-000000000221";

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const representative = await agent
      .post("/api/v1/tenants")
      .send({ fullName: "Dai Dien Cu" })
      .expect(201);
    const coTenant = await agent
      .post("/api/v1/tenants")
      .send({ fullName: "Dai Dien Moi" })
      .expect(201);
    const outsider = await agent
      .post("/api/v1/tenants")
      .send({ fullName: "Nguoi Ngoai Phong" })
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

    const payload = {
      newRepresentativeTenantId: coTenant.body.id,
      idempotencyKey: "representative-change-221",
    };
    const changed = await agent
      .post(`/api/v1/tenancies/${tenancy.body.id}/change-representative`)
      .send(payload)
      .expect(201);

    expect(changed.body.replayed).toBe(false);
    expect(changed.body.previousRepresentative.tenantId).toBe(
      representative.body.id,
    );
    expect(changed.body.newRepresentative.tenantId).toBe(coTenant.body.id);

    await agent
      .post(`/api/v1/tenancies/${tenancy.body.id}/change-representative`)
      .send(payload)
      .expect(201)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.effectiveAt).toBe(changed.body.effectiveAt);
      });

    await agent
      .post(`/api/v1/tenancies/${tenancy.body.id}/change-representative`)
      .send({
        newRepresentativeTenantId: outsider.body.id,
        idempotencyKey: payload.idempotencyKey,
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
      });

    await agent
      .get("/api/v1/tenancies")
      .expect(200)
      .expect(({ body }) => {
        const current = body.find(
          (item: { id: string }) => item.id === tenancy.body.id,
        );
        expect(current.representativeTenantId).toBe(coTenant.body.id);
        expect(current.status).toBe("ACTIVE");
        expect(current.memberCount).toBe(2);
        expect(
          current.members.filter(
            (member: { role: string; leftOn: string | null }) =>
              member.role === "REPRESENTATIVE" && member.leftOn === null,
          ),
        ).toHaveLength(1);
      });

    await agent
      .get(`/api/v1/settlements?tenancyId=${tenancy.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(0));
    await agent
      .get(`/api/v1/invoices?tenancyId=${tenancy.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(0));
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

  it("records utility readings and rejects deprecated manual prepaid input", async () => {
    const agent = request.agent(app.getHttpServer());
    const roomId = "00000000-0000-4000-8000-000000000601";

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const tenant = await agent
      .post("/api/v1/tenants")
      .send({
        fullName: "Pham Tra Truoc",
        phone: "0922000001",
        identityNumber: "032345678901",
      })
      .expect(201);

    const tenancy = await agent
      .post("/api/v1/tenancies")
      .send({
        roomId,
        representativeTenantId: tenant.body.id,
        startDate: "2026-08-16",
        rentAmount: "3100000",
      })
      .expect(201);

    await agent
      .post("/api/v1/settlements/preview")
      .send({
        tenancyId: tenancy.body.id,
        settlementType: "MONTHLY",
        billingYear: 2026,
        billingMonth: 8,
        utilityReading: {
          electricityPrevious: "10",
          electricityCurrent: "20",
          waterPrevious: "1",
          waterCurrent: "3",
        },
        prepaidAmount: "2000000",
      })
      .expect(422)
      .expect(({ body }) => {
        expect(body.error.code).toBe("PREPAID_INPUT_DEPRECATED");
      });

    await agent
      .post("/api/v1/settlements/preview")
      .send({
        tenancyId: tenancy.body.id,
        settlementType: "MONTHLY",
        billingYear: 2026,
        billingMonth: 8,
        utilityReading: {
          electricityPrevious: "10",
          electricityCurrent: "20",
          waterPrevious: "1",
          waterCurrent: "3",
        },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.utilityReadingId).toBeNull();
        expect(body.electricityAmount).toBe("35000");
        expect(body.waterAmount).toBe("30000");
      });

    await agent
      .get(`/api/v1/utility-readings?roomId=${roomId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(0);
      });

    const reading = await agent
      .post("/api/v1/utility-readings")
      .send({
        roomId,
        tenancyId: tenancy.body.id,
        readingKind: "MONTHLY",
        billingPeriodStart: "2026-08-16",
        billingPeriodEnd: "2026-08-31",
        billingYear: 2026,
        billingMonth: 8,
        electricityPrevious: "10",
        electricityCurrent: "20",
        waterPrevious: "1",
        waterCurrent: "3",
      })
      .expect(201);

    expect(reading.body.electricityUsage).toBe("10");
    expect(reading.body.electricityAmount).toBe("35000");
    expect(reading.body.waterAmount).toBe("30000");

    await agent
      .post(`/api/v1/utility-readings/${reading.body.id}/finalize`)
      .expect(201);

    await agent
      .post(`/api/v1/utility-readings/${reading.body.id}/finalize`)
      .expect(201);

    await agent
      .post("/api/v1/utility-readings")
      .send({
        roomId,
        tenancyId: tenancy.body.id,
        readingKind: "MONTHLY",
        billingPeriodStart: "2026-08-16",
        billingPeriodEnd: "2026-08-31",
        billingYear: 2026,
        billingMonth: 8,
        electricityPrevious: "20",
        electricityCurrent: "21",
        waterPrevious: "3",
        waterCurrent: "4",
      })
      .expect(201)
      .then((duplicate) =>
        agent
          .post(`/api/v1/utility-readings/${duplicate.body.id}/finalize`)
          .expect(409),
      );

    await agent
      .post("/api/v1/settlements/preview")
      .send({
        tenancyId: tenancy.body.id,
        settlementType: "MONTHLY",
        billingYear: 2026,
        billingMonth: 8,
        utilityReadingId: reading.body.id,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.occupiedDays).toBe(16);
        expect(body.daysInMonth).toBe(31);
        expect(body.proratedRentAmount).toBe("1600000");
        expect(body.totalAmount).toBe("1665000");
        expect(body.prepaidAppliedAmount).toBe("0");
        expect(body.carryForwardAmount).toBe("0");
        expect(body.outstandingAmount).toBe("1665000");
      });

    await agent
      .post("/api/v1/settlements")
      .send({
        tenancyId: tenancy.body.id,
        settlementType: "MONTHLY",
        billingYear: 2026,
        billingMonth: 8,
        utilityReadingId: reading.body.id,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("FINALIZED");
        expect(body.carryForwardAmount).toBe("0");
      });

    await agent
      .post("/api/v1/settlements")
      .send({
        tenancyId: tenancy.body.id,
        settlementType: "MONTHLY",
        billingYear: 2026,
        billingMonth: 8,
        utilityReadingId: reading.body.id,
      })
      .expect(409);
  });

  it("reuses a finalized reading when settlement was not created yet", async () => {
    const agent = request.agent(app.getHttpServer());
    const roomId = "00000000-0000-4000-8000-000000000621";

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const tenant = await agent
      .post("/api/v1/tenants")
      .send({
        fullName: "Dang Co Chi So",
        phone: "0924000001",
        identityNumber: "052345678901",
      })
      .expect(201);

    const tenancy = await agent
      .post("/api/v1/tenancies")
      .send({
        roomId,
        representativeTenantId: tenant.body.id,
        startDate: "2026-08-16",
        rentAmount: "3100000",
      })
      .expect(201);

    const reading = await agent
      .post("/api/v1/utility-readings")
      .send({
        roomId,
        tenancyId: tenancy.body.id,
        readingKind: "MONTHLY",
        billingPeriodStart: "2026-08-16",
        billingPeriodEnd: "2026-08-31",
        billingYear: 2026,
        billingMonth: 8,
        electricityPrevious: "0",
        electricityCurrent: "6",
        waterPrevious: "0",
        waterCurrent: "1",
      })
      .expect(201);

    await agent
      .post(`/api/v1/utility-readings/${reading.body.id}/finalize`)
      .expect(201);

    await agent
      .post("/api/v1/settlements")
      .send({
        tenancyId: tenancy.body.id,
        settlementType: "MONTHLY",
        billingYear: 2026,
        billingMonth: 8,
        periodEnd: "2026-08-31",
        utilityReading: {
          electricityPrevious: "0",
          electricityCurrent: "6",
          waterPrevious: "0",
          waterCurrent: "1",
        },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.utilityReadingId).toBe(reading.body.id);
        expect(body.status).toBe("FINALIZED");
      });
  });

  it("finalizes a settlement and invoice exactly once for repeated commands", async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const room = await agent
      .post("/api/v1/rooms")
      .send({
        code: "FINAL-701",
        name: "Phong chot mot lan",
        defaultRentAmount: "3100000",
      })
      .expect(201);
    const tenant = await agent
      .post("/api/v1/tenants")
      .send({ fullName: "Nguoi Chot Mot Lan" })
      .expect(201);
    const tenancy = await agent
      .post("/api/v1/tenancies")
      .send({
        roomId: room.body.id,
        representativeTenantId: tenant.body.id,
        startDate: "2026-08-01",
        rentAmount: "3100000",
      })
      .expect(201);

    const payload = {
      idempotencyKey: "finalize-invoice-701",
      tenancyId: tenancy.body.id,
      settlementType: "MONTHLY",
      billingYear: 2026,
      billingMonth: 8,
      utilityReading: {
        electricityPrevious: "0",
        electricityCurrent: "10",
        waterPrevious: "0",
        waterCurrent: "2",
      },
      prepaidAmount: "0",
    };
    const first = await agent
      .post("/api/v1/settlements/finalize-and-invoice")
      .set("Idempotency-Key", payload.idempotencyKey)
      .send(payload)
      .expect(201);

    expect(first.body.operation.status).toBe("COMPLETED");
    expect(first.body.operation.replayed).toBe(false);
    expect(first.body.invoice.sourceKey).toBe(
      `settlement:${first.body.settlement.id}`,
    );

    await agent
      .post("/api/v1/settlements/finalize-and-invoice")
      .set("Idempotency-Key", payload.idempotencyKey)
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.operation.replayed).toBe(true);
        expect(body.settlement.id).toBe(first.body.settlement.id);
        expect(body.invoice.id).toBe(first.body.invoice.id);
      });

    await agent
      .post("/api/v1/settlements/finalize-and-invoice")
      .set("Idempotency-Key", payload.idempotencyKey)
      .send({
        ...payload,
        utilityReading: {
          ...payload.utilityReading,
          electricityCurrent: "11",
        },
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
      });

    await agent
      .get(`/api/v1/settlements?tenancyId=${tenancy.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));
    await agent
      .get(`/api/v1/invoices?tenancyId=${tenancy.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));
  });

  it("resumes invoice creation from an invoice-pending operation", async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const room = await agent
      .post("/api/v1/rooms")
      .send({
        code: "PENDING-702",
        name: "Phong retry hoa don",
        defaultRentAmount: "3100000",
      })
      .expect(201);
    const tenant = await agent
      .post("/api/v1/tenants")
      .send({ fullName: "Nguoi Retry Hoa Don" })
      .expect(201);
    const tenancy = await agent
      .post("/api/v1/tenancies")
      .send({
        roomId: room.body.id,
        representativeTenantId: tenant.body.id,
        startDate: "2026-09-01",
        rentAmount: "3100000",
      })
      .expect(201);

    const billing = app.get(BillingService);
    vi.spyOn(billing, "createInvoiceFromSettlement").mockRejectedValueOnce(
      new Error("Temporary invoice failure"),
    );
    const payload = {
      idempotencyKey: "finalize-invoice-pending-702",
      tenancyId: tenancy.body.id,
      settlementType: "MONTHLY",
      billingYear: 2026,
      billingMonth: 9,
      utilityReading: {
        electricityPrevious: "0",
        electricityCurrent: "4",
        waterPrevious: "0",
        waterCurrent: "1",
      },
      prepaidAmount: "0",
    };

    const pending = await agent
      .post("/api/v1/settlements/finalize-and-invoice")
      .send(payload)
      .expect(202);
    expect(pending.body.operation.status).toBe("INVOICE_PENDING");
    expect(pending.body.operation.retryable).toBe(true);
    expect(pending.body.invoice).toBeNull();

    await agent
      .post(`/api/v1/tenancy-operations/${pending.body.operation.id}/resume`)
      .set("Idempotency-Key", "resume-invoice-pending-702")
      .send({ idempotencyKey: "resume-invoice-pending-702" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.operation.status).toBe("COMPLETED");
        expect(body.operation.replayed).toBe(false);
        expect(body.settlement.id).toBe(pending.body.settlement.id);
        expect(body.invoice.sourceKey).toBe(
          `settlement:${pending.body.settlement.id}`,
        );
      });

    await agent
      .get(`/api/v1/settlements?tenancyId=${tenancy.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));
    await agent
      .get(`/api/v1/invoices?tenancyId=${tenancy.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));
  });

  it("cancels an action-required operation idempotently after review", async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const room = await agent
      .post("/api/v1/rooms")
      .send({
        code: "RECOVERY-703",
        name: "Phong can phuc hoi",
        defaultRentAmount: "3100000",
      })
      .expect(201);
    const tenant = await agent
      .post("/api/v1/tenants")
      .send({ fullName: "Nguoi Can Phuc Hoi" })
      .expect(201);
    const tenancy = await agent
      .post("/api/v1/tenancies")
      .send({
        roomId: room.body.id,
        representativeTenantId: tenant.body.id,
        startDate: "2026-10-01",
        rentAmount: "3100000",
      })
      .expect(201);

    const billing = app.get(BillingService);
    vi.spyOn(billing, "createInvoiceFromSettlement")
      .mockRejectedValueOnce(new Error("Temporary invoice failure"))
      .mockRejectedValueOnce(new Error("Invoice still requires review"));
    const payload = {
      idempotencyKey: "finalize-action-required-703",
      tenancyId: tenancy.body.id,
      settlementType: "MONTHLY",
      billingYear: 2026,
      billingMonth: 10,
      utilityReading: {
        electricityPrevious: "0",
        electricityCurrent: "4",
        waterPrevious: "0",
        waterCurrent: "1",
      },
      prepaidAmount: "0",
    };

    const pending = await agent
      .post("/api/v1/settlements/finalize-and-invoice")
      .set("Idempotency-Key", payload.idempotencyKey)
      .send(payload)
      .expect(202);
    const operationId = pending.body.operation.id as string;

    await agent
      .post(`/api/v1/tenancy-operations/${operationId}/resume`)
      .set("Idempotency-Key", "resume-action-required-703")
      .send({ idempotencyKey: "resume-action-required-703" })
      .expect(500);

    const cancellation = {
      idempotencyKey: "cancel-action-required-703",
      reason: "Hoa don can duoc kiem tra thu cong",
    };
    await agent
      .post(`/api/v1/tenancy-operations/${operationId}/cancel`)
      .set("Idempotency-Key", cancellation.idempotencyKey)
      .send(cancellation)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("CANCELLED");
        expect(body.replayed).toBe(false);
      });

    await agent
      .post(`/api/v1/tenancy-operations/${operationId}/cancel`)
      .set("Idempotency-Key", cancellation.idempotencyKey)
      .send(cancellation)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("CANCELLED");
        expect(body.replayed).toBe(true);
      });
  });

  it("settles move-out rent through the actual leaving date", async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const room = await agent
      .post("/api/v1/rooms")
      .send({
        code: "MOVE-611",
        name: "Phong tra giua thang",
        defaultRentAmount: "3100000",
      })
      .expect(201);
    const roomId = room.body.id as string;

    const tenant = await agent
      .post("/api/v1/tenants")
      .send({
        fullName: "Do Tra Phong",
        phone: "0923000001",
        identityNumber: "042345678901",
      })
      .expect(201);

    const tenancy = await agent
      .post("/api/v1/tenancies")
      .send({
        roomId,
        representativeTenantId: tenant.body.id,
        startDate: "2026-08-01",
        rentAmount: "3100000",
      })
      .expect(201);

    await agent
      .patch(`/api/v1/tenancies/${tenancy.body.id}/end`)
      .send({
        idempotencyKey: "whole-end-move-611",
        actualEndDate: "2026-08-15",
        handoverReadings: {
          electricityPrevious: "0",
          electricityCurrent: "5",
          waterPrevious: "0",
          waterCurrent: "1",
        },
        prepaidAmount: "0",
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.operation.status).toBe("COMPLETED");
        expect(body.settlement.status).toBe("FINALIZED");
        expect(body.settlement.periodStart).toBe("2026-08-01");
        expect(body.settlement.periodEnd).toBe("2026-08-15");
        expect(body.settlement.occupiedDays).toBe(15);
        expect(body.settlement.proratedRentAmount).toBe("1500000");
        expect(body.settlement.totalAmount).toBe("1532500");
        expect(body.invoice.sourceKey).toBe(`settlement:${body.settlement.id}`);
      });

    await agent
      .get(`/api/v1/utility-readings?roomId=${roomId}&status=FINALIZED`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].readingKind).toBe("MOVE_OUT");
      });
  });

  it("creates invoices from settlements and allocates idempotent payments", async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const room = await agent
      .post("/api/v1/rooms")
      .send({
        code: "BILL-501",
        name: "Phong billing 501",
        defaultRentAmount: "3000000",
        maxOccupants: 2,
      })
      .expect(201);

    const tenant = await agent
      .post("/api/v1/tenants")
      .send({
        fullName: "Nguoi Thanh Toan",
        phone: "0930000001",
        identityNumber: "062345678901",
      })
      .expect(201);

    const tenancy = await agent
      .post("/api/v1/tenancies")
      .send({
        roomId: room.body.id,
        representativeTenantId: tenant.body.id,
        startDate: "2026-06-01",
        rentAmount: "3000000",
      })
      .expect(201);

    const settlement = await agent
      .post("/api/v1/settlements")
      .send({
        tenancyId: tenancy.body.id,
        settlementType: "MONTHLY",
        billingYear: 2026,
        billingMonth: 6,
        utilityReading: {
          electricityPrevious: "0",
          electricityCurrent: "10",
          waterPrevious: "0",
          waterCurrent: "2",
        },
      })
      .expect(201);

    const invoice = await agent
      .post("/api/v1/invoices/from-settlement")
      .send({ settlementId: settlement.body.id })
      .expect(201);

    expect(invoice.body.status).toBe("ISSUED");
    expect(invoice.body).not.toHaveProperty("sourceKey");
    expect(invoice.body).not.toHaveProperty("pricingSnapshot");
    expect(
      invoice.body.items.every((item: object) => !("metadata" in item)),
    ).toBe(true);
    expect(invoice.body.totalAmount).toBe(settlement.body.outstandingAmount);
    expect(
      invoice.body.items.map((item: { itemType: string }) => item.itemType),
    ).toContain("RENT");

    await agent
      .get("/api/v1/dashboard/actions?asOf=2026-07-02")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            asOf: "2026-07-02",
            dueSoonDays: 3,
            items: expect.any(Array),
          }),
        );
        const dueSoon = body.items.find(
          (item: {
            kind: string;
            target: { params?: { invoiceId?: string } };
          }) =>
            item.kind === "DUE_SOON" &&
            item.target.params?.invoiceId === invoice.body.id,
        );
        expect(dueSoon.target.route).toBe("/invoices");
        expect(
          body.items.every(
            (item: { target: { route: string } }) =>
              item.target.route === "/utilities" ||
              item.target.route === "/invoices",
          ),
        ).toBe(true);
      });

    await agent
      .post("/api/v1/invoices/from-settlement")
      .send({ settlementId: settlement.body.id })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe(invoice.body.id);
      });

    await agent
      .post("/api/v1/payments")
      .set("Idempotency-Key", "payment-key-bill-501")
      .send({
        invoiceId: invoice.body.id,
        amount: "1000000",
        method: "CASH",
        paidAt: "2026-07-02T10:00:00.000Z",
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.amount).toBe("1000000");
        expect(body.status).toBe("CONFIRMED");
      });

    await agent
      .post("/api/v1/payments")
      .set("Idempotency-Key", "payment-key-bill-501")
      .send({
        invoiceId: invoice.body.id,
        amount: "1000000",
        method: "CASH",
        paidAt: "2026-07-02T10:00:00.000Z",
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.idempotencyKey).toBe("payment-key-bill-501");
      });

    await agent
      .post("/api/v1/payments")
      .set("Idempotency-Key", "payment-key-bill-501")
      .send({
        invoiceId: invoice.body.id,
        amount: "500000",
        method: "CASH",
        paidAt: "2026-07-02T10:00:00.000Z",
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
      });

    const partiallyPaid = await agent
      .get(`/api/v1/invoices/${invoice.body.id}`)
      .expect(200);
    expect(partiallyPaid.body.status).toBe("PARTIALLY_PAID");
    expect(partiallyPaid.body).not.toHaveProperty("propertyId");
    expect(partiallyPaid.body).not.toHaveProperty("sourceKey");
    expect(partiallyPaid.body).not.toHaveProperty("pricingSnapshot");
    const electricityItem = partiallyPaid.body.items.find(
      (item: { itemType: string }) => item.itemType === "ELECTRICITY",
    );
    expect(electricityItem).toEqual(
      expect.objectContaining({
        quantity: "10",
        unit: "kWh",
        unitPrice: "3500",
        amount: "35000",
        utilityUsage: {
          previous: "0",
          current: "10",
          usage: "10",
          unit: "kWh",
          unitPrice: "3500",
          amount: "35000",
        },
        utilityUsageSource: "INVOICE_SNAPSHOT",
      }),
    );
    expect(electricityItem).not.toHaveProperty("metadata");
    expect(partiallyPaid.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemType: "WATER",
          quantity: "2",
          unit: "m3",
          utilityUsage: expect.objectContaining({
            previous: "0",
            current: "2",
            usage: "2",
            unit: "m3",
          }),
        }),
      ]),
    );
    expect(partiallyPaid.body.paymentAllocations[0].paymentNumber).toMatch(
      /^PAY-/,
    );
    expect(partiallyPaid.body.paymentAllocations[0].paymentMethod).toBe("CASH");
    expect(partiallyPaid.body.outstandingAmount).toBe(
      String(Number(invoice.body.totalAmount) - 1000000),
    );

    await agent
      .get(`/api/v1/debts?roomId=${room.body.id}&status=OVERDUE`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].debtStatus).toBe("OVERDUE");
        expect(body[0].daysOverdue).toBeGreaterThan(0);
        expect(body[0].latestPaymentAt).toBeTruthy();
        expect(body[0].totalOutstanding).toBe(
          partiallyPaid.body.outstandingAmount,
        );
      });

    await agent
      .get(`/api/v1/debts?roomId=${room.body.id}&status=PARTIALLY_PAID`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
      });

    await agent
      .get("/api/v1/dashboard/summary?asOf=2026-07-30")
      .expect(200)
      .expect(({ body }) => {
        expect(body.billingYear).toBe(2026);
        expect(body.billingMonth).toBe(7);
        expect(body.totals.currentMonthCollected).toBe("1000000");
        expect(body.totals.overdueInvoiceCount).toBe(1);
        expect(body.needsAttention[0].kind).toBe("OVERDUE_DEBT");
      });

    await agent
      .get("/api/v1/reports/monthly?billingYear=2026&billingMonth=6")
      .expect(200)
      .expect(({ body }) => {
        expect(body.periodStart).toBe("2026-06-01");
        expect(body.periodEnd).toBe("2026-06-30");
        expect(body.totals.invoiceTotal).toBe(invoice.body.totalAmount);
        expect(body.totals.overdue).toBe("0");
        expect(body.totals.electricity).toBe("35000");
        expect(body.totals.water).toBe("30000");
        expect(body.invoices).toHaveLength(1);
        expect(body.debts).toHaveLength(1);
      });

    await agent
      .get(
        `/api/v1/reports/monthly?billingYear=2026&billingMonth=6&roomId=${room.body.id}`,
      )
      .expect(200)
      .expect(({ body }) => {
        expect(body.invoices).toHaveLength(1);
        expect(body.invoices[0].id).toBe(invoice.body.id);
        expect(body.invoices[0].roomId).toBe(room.body.id);
        expect(
          body.payments.every(
            (item: { roomId: string }) => item.roomId === room.body.id,
          ),
        ).toBe(true);
        expect(
          body.debts.every(
            (item: { roomId: string }) => item.roomId === room.body.id,
          ),
        ).toBe(true);
      });

    await agent
      .get(
        "/api/v1/reports/monthly?billingYear=2026&billingMonth=6&roomId=00000000-0000-4000-8000-000000009999",
      )
      .expect(404);

    await agent
      .get("/api/v1/reports/monthly.csv?billingYear=2026&billingMonth=6")
      .expect(200)
      .expect("Content-Type", /text\/csv/)
      .expect(({ text }) => {
        expect(text).toContain("Hoa don");
        expect(text).toContain("Cong no");
        expect(text).toContain(invoice.body.invoiceNumber);
      });

    await agent
      .get(
        `/api/v1/reports/monthly.csv?billingYear=2026&billingMonth=6&roomId=${room.body.id}`,
      )
      .expect(200)
      .expect(({ text }) => {
        expect(text).toContain(invoice.body.invoiceNumber);
      });

    await agent
      .post("/api/v1/payments")
      .set("Idempotency-Key", "payment-key-bill-501-final")
      .send({
        invoiceId: invoice.body.id,
        amount: partiallyPaid.body.outstandingAmount,
        method: "BANK_TRANSFER",
        paidAt: "2026-07-30T10:00:00.000Z",
      })
      .expect(201);

    await agent
      .get(`/api/v1/invoices/${invoice.body.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("PAID");
        expect(body.outstandingAmount).toBe("0");
      });

    await agent
      .get(`/api/v1/debts?roomId=${room.body.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(0);
      });
  });
});
