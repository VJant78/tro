import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createApiApp } from "../../apps/api/src/main.js";

describe("Phase 2 foundation smoke", () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApiApp();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves API health through the versioned API prefix", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200)
      .expect(({ body }) => {
        expect(body.service).toBe("tro-api");
      });
  });

  it("keeps phase ownership documented before domain work starts", () => {
    const matrix = readFileSync(
      resolve("docs/file-ownership-matrix.md"),
      "utf8",
    );

    expect(matrix).toContain("apps/api/**");
    expect(matrix).toContain("apps/web/**");
    expect(matrix).toContain("packages/database/**");
  });

  it("smokes Phase 3 room and tenant APIs with authenticated session", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.local", password: "ChangeMe123!" })
      .expect(201);

    const room = await agent
      .post("/api/v1/rooms")
      .send({ code: "E2E-101", name: "E2E Room", defaultRentAmount: "1000000" })
      .expect(201);
    const tenant = await agent
      .post("/api/v1/tenants")
      .send({ fullName: "E2E Tenant", phone: "0900000099" })
      .expect(201);
    const tenancy = await agent
      .post("/api/v1/tenancies")
      .send({
        roomId: room.body.id,
        representativeTenantId: tenant.body.id,
        startDate: "2026-08-01",
        rentAmount: "1000000",
      })
      .expect(201);

    expect(tenancy.body.status).toBe("ACTIVE");
  });
});
