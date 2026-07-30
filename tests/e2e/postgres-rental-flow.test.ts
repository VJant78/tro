import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const baseUrl = process.env.POSTGRES_FLOW_BASE_URL;
const flow = describe.skipIf(!baseUrl);

interface Room {
  id: string;
  code: string;
  currentOccupancy: { tenancyId: string } | null;
}

interface Tenant {
  id: string;
  fullName: string;
}

interface Tenancy {
  id: string;
  roomId: string;
  representativeTenantId: string;
  memberCount: number;
}

interface Invoice {
  id: string;
  payerTenantId: string;
  outstandingAmount: string;
  status: string;
}

interface Payment {
  id: string;
  amount: string;
  idempotencyKey: string;
}

interface ApiResult<T> {
  status: number;
  body: T;
}

flow("PostgreSQL rental business flow", () => {
  it("keeps member, representative, settlement and payment rules consistent", async () => {
    const client = await authenticatedClient();
    const suffix = randomUUID().slice(0, 8).toUpperCase();

    const initialRooms = await client.get<{ data: Room[] }>(
      "/rooms?limit=100&sort=code:asc",
    );
    const initialTenants = await client.get<{ data: Tenant[] }>(
      "/tenants?limit=100",
    );
    expect(initialRooms.data).toHaveLength(0);
    expect(initialTenants.data).toHaveLength(0);

    const roomA = await client.post<Room>("/rooms", {
      code: `A-${suffix}`,
      name: "Phong A E2E",
      defaultRentAmount: "3100000",
      maxOccupants: 4,
    });
    const roomB = await client.post<Room>("/rooms", {
      code: `B-${suffix}`,
      name: "Phong B E2E",
      defaultRentAmount: "3100000",
      maxOccupants: 4,
    });
    const roomC = await client.post<Room>("/rooms", {
      code: `C-${suffix}`,
      name: "Phong C E2E",
      defaultRentAmount: "3100000",
      maxOccupants: 4,
    });
    const firstRepresentative = await client.post<Tenant>("/tenants", {
      fullName: `Dai dien cu ${suffix}`,
      phone: "0900000001",
    });
    const nextRepresentative = await client.post<Tenant>("/tenants", {
      fullName: `Dai dien moi ${suffix}`,
      phone: "0900000002",
    });
    const coTenant = await client.post<Tenant>("/tenants", {
      fullName: `Nguoi o chung ${suffix}`,
      phone: "0900000003",
    });

    const sourceTenancy = await client.post<Tenancy>("/tenancies", {
      roomId: roomA.id,
      representativeTenantId: firstRepresentative.id,
      startDate: "2026-07-10",
      rentAmount: "3100000",
    });
    const joined = await client.post<Tenancy>("/tenancies", {
      roomId: roomA.id,
      representativeTenantId: nextRepresentative.id,
      startDate: "2026-07-12",
    });
    expect(joined.id).toBe(sourceTenancy.id);
    expect(joined.memberCount).toBe(2);

    const firstRepresentativeChangeKey = randomUUID();
    await client.post(
      `/tenancies/${sourceTenancy.id}/change-representative`,
      {
        newRepresentativeTenantId: nextRepresentative.id,
        idempotencyKey: firstRepresentativeChangeKey,
      },
      { "Idempotency-Key": firstRepresentativeChangeKey },
    );

    const memberTransfer = await client.post<Tenancy>(
      `/tenancies/${sourceTenancy.id}/members/${firstRepresentative.id}/transfer`,
      { toRoomId: roomB.id, transferDate: "2026-07-20" },
    );
    expect(memberTransfer.roomId).toBe(roomB.id);
    expect(memberTransfer.representativeTenantId).toBe(firstRepresentative.id);
    expect(
      await client.get<unknown[]>(`/settlements?tenancyId=${sourceTenancy.id}`),
    ).toHaveLength(0);

    const rejoined = await client.post<Tenancy>("/tenancies", {
      roomId: roomA.id,
      representativeTenantId: coTenant.id,
      startDate: "2026-07-22",
    });
    expect(rejoined.id).toBe(sourceTenancy.id);
    expect(rejoined.memberCount).toBe(2);

    const transferKey = randomUUID();
    const transferred = await client.post<{
      operation: { status: string };
      settlement: {
        occupiedDays: number;
        daysInMonth: number;
        proratedRentAmount: string;
        totalAmount: string;
        prepaidAppliedAmount: string;
        outstandingAmount: string;
      };
      invoice: Invoice;
      transfer: { targetTenancyId: string };
    }>(
      `/tenancies/${sourceTenancy.id}/transfer`,
      {
        idempotencyKey: transferKey,
        toRoomId: roomC.id,
        transferDate: "2026-07-30",
        handoverReadings: {
          electricityPrevious: "0",
          electricityCurrent: "10",
          waterPrevious: "0",
          waterCurrent: "3",
        },
        prepaidAmount: "100000",
      },
      { "Idempotency-Key": transferKey },
    );
    expect(transferred.operation.status).toBe("COMPLETED");
    expect(transferred.settlement).toEqual(
      expect.objectContaining({
        occupiedDays: 21,
        daysInMonth: 31,
        proratedRentAmount: "2100000",
        prepaidAppliedAmount: "100000",
      }),
    );
    expect(BigInt(transferred.settlement.outstandingAmount)).toBe(
      BigInt(transferred.settlement.totalAmount) - 100000n,
    );
    expect(transferred.invoice.payerTenantId).toBe(nextRepresentative.id);

    const targetTenancyId = transferred.transfer.targetTenancyId;
    const secondRepresentativeChangeKey = randomUUID();
    await client.post(
      `/tenancies/${targetTenancyId}/change-representative`,
      {
        newRepresentativeTenantId: coTenant.id,
        idempotencyKey: secondRepresentativeChangeKey,
      },
      { "Idempotency-Key": secondRepresentativeChangeKey },
    );
    const immutableInvoice = await client.get<Invoice>(
      `/invoices/${transferred.invoice.id}`,
    );
    expect(immutableInvoice.payerTenantId).toBe(nextRepresentative.id);

    const paymentBody = {
      invoiceId: transferred.invoice.id,
      amount: transferred.invoice.outstandingAmount,
      method: "BANK_TRANSFER",
      paidAt: "2026-07-30T12:00:00.000Z",
    };
    const paymentKeyA = randomUUID();
    const paymentKeyB = randomUUID();
    const paymentResults = await Promise.all([
      client.raw<Payment>("POST", "/payments", paymentBody, {
        "Idempotency-Key": paymentKeyA,
      }),
      client.raw<Payment>("POST", "/payments", paymentBody, {
        "Idempotency-Key": paymentKeyB,
      }),
    ]);
    expect(paymentResults.map((result) => result.status).sort()).toEqual([
      201, 422,
    ]);
    const successfulPayment = paymentResults.find(
      (result) => result.status === 201,
    );
    expect(successfulPayment).toBeDefined();
    const successfulKey =
      successfulPayment?.body.idempotencyKey === paymentKeyA
        ? paymentKeyA
        : paymentKeyB;
    const replayedPayment = await client.post<Payment>(
      "/payments",
      paymentBody,
      { "Idempotency-Key": successfulKey },
    );
    expect(replayedPayment.id).toBe(successfulPayment?.body.id);

    const endKey = randomUUID();
    const ended = await client.patch<{
      operation: { status: string };
      settlement: { occupiedDays: number; proratedRentAmount: string };
      invoice: Invoice;
    }>(
      `/tenancies/${targetTenancyId}/end`,
      {
        idempotencyKey: endKey,
        actualEndDate: "2026-07-30",
        handoverReadings: {
          electricityPrevious: "0",
          electricityCurrent: "1",
          waterPrevious: "0",
          waterCurrent: "1",
        },
        prepaidAmount: "0",
      },
      { "Idempotency-Key": endKey },
    );
    expect(ended.operation.status).toBe("COMPLETED");
    expect(ended.settlement.occupiedDays).toBe(1);
    expect(ended.settlement.proratedRentAmount).toBe("100000");
    expect(ended.invoice.payerTenantId).toBe(coTenant.id);

    const rooms = await client.get<{ data: Room[] }>(
      "/rooms?limit=100&sort=code:asc",
    );
    expect(
      rooms.data.find((room) => room.id === roomA.id)?.currentOccupancy,
    ).toBeNull();
    expect(
      rooms.data.find((room) => room.id === roomB.id)?.currentOccupancy,
    ).not.toBeNull();
    expect(
      rooms.data.find((room) => room.id === roomC.id)?.currentOccupancy,
    ).toBeNull();

    const debts = await client.get<Array<{ roomId: string }>>("/debts");
    expect(debts.some((debt) => debt.roomId === roomC.id)).toBe(true);
    const dashboard = await client.get<{
      items: Array<{ kind: string; roomId: string }>;
    }>("/dashboard/actions?asOf=2026-07-30");
    expect(
      dashboard.items.some(
        (item) => item.kind === "UNSETTLED_PERIOD" && item.roomId === roomB.id,
      ),
    ).toBe(true);
    const report = await client.get<{ invoices: Invoice[] }>(
      "/reports/monthly?billingYear=2026&billingMonth=7",
    );
    expect(report.invoices.length).toBeGreaterThanOrEqual(2);
  }, 60_000);
});

async function authenticatedClient() {
  if (!baseUrl) throw new Error("POSTGRES_FLOW_BASE_URL is required");
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.FLOW_EMAIL ?? "owner@example.local",
      password: process.env.FLOW_PASSWORD ?? "ChangeMe123!",
    }),
  });
  if (response.status !== 201) {
    throw new Error(`Login failed with HTTP ${response.status}`);
  }
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Login did not return a session cookie");

  async function raw<T>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<ApiResult<T>> {
    const result = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Cookie: cookie,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await result.text();
    const parsed = text ? (JSON.parse(text) as T) : (undefined as T);
    return { status: result.status, body: parsed };
  }

  async function successful<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) {
    const result = await raw<T>(method, path, body, headers);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `${method} ${path} failed with HTTP ${result.status}: ${JSON.stringify(result.body)}`,
      );
    }
    return result.body;
  }

  return {
    raw,
    get: <T>(path: string) => successful<T>("GET", path),
    post: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
      successful<T>("POST", path, body, headers),
    patch: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
      successful<T>("PATCH", path, body, headers),
  };
}
