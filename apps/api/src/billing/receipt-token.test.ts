import { afterEach, describe, expect, it } from "vitest";
import { DomainException } from "../platform/domain.exception.js";
import { receiptPreviewSecret } from "./receipt.service.js";
import {
  createReceiptPreviewToken,
  verifyReceiptPreviewToken,
} from "./receipt-token.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalReceiptSecret = process.env.RECEIPT_PREVIEW_SECRET;
const originalSessionSecret = process.env.SESSION_SECRET;

afterEach(() => {
  setEnvironment("NODE_ENV", originalNodeEnv);
  setEnvironment("RECEIPT_PREVIEW_SECRET", originalReceiptSecret);
  setEnvironment("SESSION_SECRET", originalSessionSecret);
});

describe("receipt preview token", () => {
  it("binds the signed snapshot and expires after five minutes", () => {
    const issuedAt = Date.parse("2026-07-30T12:00:00.000Z");
    const created = createReceiptPreviewToken(
      {
        propertyId: "property-1",
        tenancyId: "tenancy-1",
        actorUserId: "actor-1",
        intentHash: "intent-hash",
        snapshotHash: "snapshot-hash",
      },
      "test-secret",
      issuedAt,
    );

    expect(
      verifyReceiptPreviewToken(created.token, "test-secret", issuedAt + 1),
    ).toEqual(
      expect.objectContaining({
        propertyId: "property-1",
        snapshotHash: "snapshot-hash",
      }),
    );
    expect(() =>
      verifyReceiptPreviewToken(
        created.token,
        "test-secret",
        issuedAt + 5 * 60 * 1000,
      ),
    ).toThrowError(expect.objectContaining({ message: expect.any(String) }));
  });

  it("rejects tampering with a stable stale-preview error", () => {
    const created = createReceiptPreviewToken(
      {
        propertyId: "property-1",
        tenancyId: "tenancy-1",
        actorUserId: "actor-1",
        intentHash: "intent-hash",
        snapshotHash: "snapshot-hash",
      },
      "test-secret",
    );
    try {
      verifyReceiptPreviewToken(`${created.token}x`, "test-secret");
      throw new Error("Expected token verification to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      expect((error as DomainException).getResponse()).toEqual(
        expect.objectContaining({ code: "ALLOCATION_PREVIEW_STALE" }),
      );
    }
  });

  it("fails fast in production when no signing secret is configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.RECEIPT_PREVIEW_SECRET;
    delete process.env.SESSION_SECRET;

    try {
      receiptPreviewSecret();
      throw new Error("Expected missing production secret to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      expect((error as DomainException).getResponse()).toEqual(
        expect.objectContaining({ code: "RECEIPT_PREVIEW_SECRET_MISSING" }),
      );
    }
  });
});

function setEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
