import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainException } from "../platform/domain.exception.js";
import type { ReceiptTokenPayload } from "./receipt.types.js";

const TOKEN_TTL_MS = 5 * 60 * 1000;

export function createReceiptPreviewToken(
  input: Omit<ReceiptTokenPayload, "version" | "issuedAt" | "expiresAt">,
  secret: string,
  now = Date.now(),
) {
  const payload: ReceiptTokenPayload = {
    version: 1,
    ...input,
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded, secret);
  return {
    token: `${encoded}.${signature}`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export function verifyReceiptPreviewToken(
  token: string,
  secret: string,
  now = Date.now(),
) {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) throw stalePreview();
  const expected = sign(encoded, secret);
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw stalePreview();
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<ReceiptTokenPayload>;
    if (
      parsed.version !== 1 ||
      typeof parsed.propertyId !== "string" ||
      typeof parsed.tenancyId !== "string" ||
      typeof parsed.actorUserId !== "string" ||
      typeof parsed.intentHash !== "string" ||
      typeof parsed.snapshotHash !== "string" ||
      typeof parsed.issuedAt !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now ||
      parsed.issuedAt > now + 30_000
    ) {
      throw stalePreview();
    }
    return parsed as ReceiptTokenPayload;
  } catch (error) {
    if (error instanceof DomainException) throw error;
    throw stalePreview();
  }
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function stalePreview() {
  return new DomainException(
    "ALLOCATION_PREVIEW_STALE",
    "Receipt preview expired or no longer matches current data",
    409,
  );
}
