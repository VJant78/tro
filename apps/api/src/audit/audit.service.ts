import { Injectable } from "@nestjs/common";
import { getRequestId } from "../platform/request-context.js";

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

  async record(input: AuditRecordInput) {
    const record = {
      ...input,
      requestId: getRequestId(),
      createdAt: new Date().toISOString(),
    };

    this.inMemoryRecords.push(record);
    return record;
  }

  listForTests() {
    return [...this.inMemoryRecords];
  }
}
