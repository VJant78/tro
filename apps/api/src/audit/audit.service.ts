import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type AuditAction } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import { getAuditRequestContext } from "../platform/request-context.js";

export interface AuditRecordInput {
  action:
    | "CREATE"
    | "UPDATE"
    | "DELETE"
    | "RESTORE"
    | "STATUS_CHANGE"
    | "ISSUE_INVOICE"
    | "CONFIRM_PAYMENT"
    | "VOID_PAYMENT"
    | "ADJUST_DEBT"
    | "FINALIZE_READING"
    | "CHANGE_PRICING";
  entityType: string;
  entityId: string;
  actorUserId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly inMemoryRecords: Array<
    AuditRecordInput & { requestId: string; createdAt: string }
  > = [];

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput, tx?: Prisma.TransactionClient) {
    const context = getAuditRequestContext();
    const record = {
      ...input,
      oldValues: redactAuditValue(input.oldValues),
      newValues: redactAuditValue(input.newValues),
      metadata: redactAuditValue(input.metadata) as
        Record<string, unknown> | undefined,
      requestId: context.requestId,
      createdAt: new Date().toISOString(),
    };

    if (process.env.NODE_ENV === "test") {
      this.inMemoryRecords.push(record);
      return record;
    }

    const client = tx ?? this.prisma;
    return client.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action as AuditAction,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValues: asJson(record.oldValues),
        newValues: asJson(record.newValues),
        metadata: asJson(record.metadata),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent?.slice(0, 500),
        requestId: context.requestId,
      },
    });
  }

  listForTests() {
    return [...this.inMemoryRecords];
  }
}

const sensitiveKey =
  /(password|token|cookie|secret|identity|document|address|phone|email|name|hometown|vehiclePlate|emergency)/i;

function redactAuditValue(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= 8) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : redactAuditValue(item, depth + 1),
    ]),
  );
}

function asJson(value: unknown) {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}
