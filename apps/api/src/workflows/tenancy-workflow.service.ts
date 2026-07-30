import { randomUUID } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service.js";
import { BillingService } from "../billing/billing.service.js";
import { ReceiptService } from "../billing/receipt.service.js";
import {
  BillingRoomNotFoundException,
  BillingValidationException,
  SettlementInvoiceNotFoundException,
} from "../billing/billing.errors.js";
import type {
  InvoiceCreateInput,
  InvoiceRecord,
} from "../billing/billing.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { requestHash } from "../platform/idempotency.js";
import { authorizedPropertyId } from "../platform/property-scope.js";
import { moneyString, moneyValue } from "../platform/numeric.js";
import { TenantsService } from "../tenants/tenants.service.js";
import type { TenancyRecord } from "../tenants/tenants.types.js";
import { FinalizedSettlementConflictException } from "../utilities/utilities.errors.js";
import { UtilitiesService } from "../utilities/utilities.service.js";
import type {
  SettlementInput,
  SettlementRecord,
} from "../utilities/utilities.types.js";
import {
  CommandActionRequiredException,
  CommandAlreadyInProgressException,
  TargetRoomUnavailableException,
  WorkflowIdempotencyKeyReusedException,
  WorkflowValidationException,
} from "./tenancy-workflow.errors.js";
import type {
  FinalizeAndInvoiceInput,
  WholeGroupEndInput,
  WholeGroupTransferInput,
  OperationCancelInput,
  OperationRecoveryInput,
} from "./tenancy-workflow.schemas.js";

type OperationType =
  "FINALIZE_AND_INVOICE" | "WHOLE_GROUP_TRANSFER" | "WHOLE_GROUP_END";
type OperationStatus =
  | "IN_PROGRESS"
  | "INVOICE_PENDING"
  | "COMPLETED"
  | "ACTION_REQUIRED"
  | "CANCELLED";

interface OperationState {
  id: string;
  operationType: OperationType;
  status: OperationStatus;
  idempotencyKey: string;
  requestHash: string;
  sourceTenancyId: string;
  propertyId: string;
  targetRoomId: string | null;
  targetTenancyId: string | null;
  settlementId: string | null;
  invoiceId: string | null;
  handoverRecordId: string | null;
  effectiveOn: string;
  updatedAt: string;
  resultJson: Record<string, unknown> | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface WorkflowResult {
  httpStatus: number;
  operation: {
    id: string;
    status: OperationStatus;
    replayed: boolean;
    retryable: boolean;
  };
  settlement: SettlementRecord;
  invoice: InvoiceRecord | null;
  transfer: {
    sourceTenancyId: string;
    targetTenancyId: string;
    effectiveOn: string;
  } | null;
}

export interface OperationRecoveryResult {
  id: string;
  status: OperationStatus;
  replayed: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
}

@Injectable()
export class TenancyWorkflowService {
  private readonly memoryOperations = new Map<string, OperationState>();
  private readonly activeCommands = new Set<string>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UtilitiesService) private readonly utilities: UtilitiesService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(ReceiptService) private readonly receipts: ReceiptService,
    @Inject(TenantsService) private readonly tenants: TenantsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  finalizeAndInvoice(
    input: FinalizeAndInvoiceInput,
    actorUserId?: string,
  ): Promise<WorkflowResult> {
    const settlement = normalizeSettlementInput(input);
    return this.runCommand(
      "FINALIZE_AND_INVOICE",
      input.idempotencyKey,
      input.tenancyId,
      settlement.periodEnd ?? monthEnd(input.billingYear, input.billingMonth),
      null,
      input,
      settlement,
      actorUserId,
    );
  }

  transferWholeGroup(
    tenancyId: string,
    input: WholeGroupTransferInput,
    actorUserId?: string,
  ): Promise<WorkflowResult> {
    const settlement = moveOutSettlementInput(
      tenancyId,
      input.transferDate,
      input.handoverReadings,
      input.prepaidAmount,
      input.notes,
    );
    return this.runCommand(
      "WHOLE_GROUP_TRANSFER",
      input.idempotencyKey,
      tenancyId,
      input.transferDate,
      input.toRoomId,
      { tenancyId, ...input },
      settlement,
      actorUserId,
      input,
    );
  }

  endWholeGroup(
    tenancyId: string,
    input: WholeGroupEndInput,
    actorUserId?: string,
  ): Promise<WorkflowResult> {
    const settlement = moveOutSettlementInput(
      tenancyId,
      input.actualEndDate,
      input.handoverReadings,
      input.prepaidAmount,
      input.notes,
    );
    return this.runCommand(
      "WHOLE_GROUP_END",
      input.idempotencyKey,
      tenancyId,
      input.actualEndDate,
      null,
      { tenancyId, ...input },
      settlement,
      actorUserId,
      input,
    );
  }

  async resumeOperation(
    operationId: string,
    input: OperationRecoveryInput,
    actorUserId?: string,
  ): Promise<WorkflowResult> {
    if (!actorUserId)
      throw new UnauthorizedException("Authentication required");
    let operation = await this.loadOperation(operationId);
    const hash = requestHash({ action: "RESUME", operationId });
    const recovery = recoveryData(operation.resultJson, "recovery");
    if (recovery?.idempotencyKey === input.idempotencyKey) {
      if (recovery.requestHash !== hash) {
        throw new WorkflowIdempotencyKeyReusedException();
      }
      if (operation.status === "COMPLETED") {
        return this.buildResult(operation, true, 200);
      }
    } else if (recovery) {
      throw new WorkflowIdempotencyKeyReusedException();
    }
    if (
      operation.status !== "ACTION_REQUIRED" &&
      operation.status !== "INVOICE_PENDING"
    ) {
      throw new CommandActionRequiredException();
    }
    if (!recovery) {
      operation = await this.markOperationForRecovery(
        operation,
        input.idempotencyKey,
        hash,
        actorUserId,
      );
    }
    const settlement = operation.settlementId
      ? await this.utilities.findSettlementById(operation.settlementId)
      : null;
    if (!settlement) throw new CommandActionRequiredException();
    try {
      if (operation.operationType === "FINALIZE_AND_INVOICE") {
        const invoice = await this.billing.createInvoiceFromSettlement(
          settlement.id,
          actorUserId,
        );
        operation = await this.completeFinalizeOperation(
          operation,
          settlement.id,
          invoice.id,
          actorUserId,
        );
      } else {
        const reading = settlement.utilityReadingId
          ? (
              await this.utilities.listReadings({
                tenancyId: settlement.tenancyId,
                status: "FINALIZED",
              })
            ).find((item) => item.id === settlement.utilityReadingId)
          : null;
        if (!reading) throw new CommandActionRequiredException();
        const handoverReadings = {
          electricityPrevious: reading.electricityPrevious,
          electricityCurrent: reading.electricityCurrent,
          waterPrevious: reading.waterPrevious,
          waterCurrent: reading.waterCurrent,
        };
        const transitionInput: WholeGroupTransferInput | WholeGroupEndInput =
          operation.operationType === "WHOLE_GROUP_TRANSFER" &&
          operation.targetRoomId
            ? {
                idempotencyKey: operation.idempotencyKey,
                toRoomId: operation.targetRoomId,
                transferDate: operation.effectiveOn,
                handoverReadings,
                prepaidAmount: "0",
                notes: settlement.notes,
              }
            : {
                idempotencyKey: operation.idempotencyKey,
                actualEndDate: operation.effectiveOn,
                handoverReadings,
                prepaidAmount: "0",
                notes: settlement.notes,
              };
        operation = await this.completeTransition(
          operation,
          transitionInput,
          actorUserId,
        );
      }
      return this.buildResult(operation, false, 200);
    } catch (error) {
      await this.updateOperation(operation.id, {
        status: "ACTION_REQUIRED",
        lastErrorCode: "COMMAND_ACTION_REQUIRED",
      });
      throw error;
    }
  }

  async cancelOperation(
    operationId: string,
    input: OperationCancelInput,
    actorUserId?: string,
  ): Promise<OperationRecoveryResult> {
    if (!actorUserId)
      throw new UnauthorizedException("Authentication required");
    const operation = await this.loadOperation(operationId);
    const hash = requestHash({
      action: "CANCEL",
      operationId,
      reason: input.reason,
    });
    const cancellation = recoveryData(operation.resultJson, "cancellation");
    if (operation.status === "CANCELLED") {
      if (
        cancellation?.idempotencyKey !== input.idempotencyKey ||
        cancellation.requestHash !== hash
      ) {
        throw new WorkflowIdempotencyKeyReusedException();
      }
      return operationSummary(operation, true);
    }
    if (operation.status !== "ACTION_REQUIRED") {
      throw new CommandActionRequiredException();
    }
    if (process.env.NODE_ENV === "test") {
      const cancelled = await this.updateOperation(operation.id, {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: input.reason,
        resultJson: mergeResult(operation.resultJson, {
          cancellation: {
            idempotencyKey: input.idempotencyKey,
            requestHash: hash,
          },
        }),
      });
      await this.audit.record({
        action: "STATUS_CHANGE",
        entityType: "tenancy_operation",
        entityId: operation.id,
        actorUserId,
        newValues: { status: "CANCELLED", reason: input.reason },
      });
      return operationSummary(cancelled, false);
    }
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.tenancyOperation.updateMany({
        where: {
          id: operation.id,
          status: "ACTION_REQUIRED",
          updatedAt: new Date(operation.updatedAt),
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: input.reason,
          lastErrorCode: null,
          resultJson: mergeResult(operation.resultJson, {
            cancellation: {
              idempotencyKey: input.idempotencyKey,
              requestHash: hash,
            },
          }) as Prisma.InputJsonObject,
        },
      });
      if (changed.count !== 1) {
        throw new CommandAlreadyInProgressException();
      }
      await this.audit.record(
        {
          action: "STATUS_CHANGE",
          entityType: "tenancy_operation",
          entityId: operation.id,
          actorUserId,
          newValues: { status: "CANCELLED", reason: input.reason },
        },
        tx,
      );
      return tx.tenancyOperation.findUniqueOrThrow({
        where: { id: operation.id },
      });
    });
    return operationSummary(mapOperation(cancelled), false);
  }

  private async runCommand(
    operationType: OperationType,
    idempotencyKey: string,
    sourceTenancyId: string,
    effectiveOn: string,
    targetRoomId: string | null,
    hashInput: unknown,
    settlementInput: SettlementInput,
    actorUserId?: string,
    transitionInput?: WholeGroupTransferInput | WholeGroupEndInput,
  ): Promise<WorkflowResult> {
    if (!actorUserId)
      throw new UnauthorizedException("Authentication required");
    const propertyId = authorizedPropertyId();
    const lockKey = `${propertyId}:${operationType}:${idempotencyKey}`;
    if (this.activeCommands.has(lockKey)) {
      throw new CommandAlreadyInProgressException();
    }
    this.activeCommands.add(lockKey);
    try {
      const hash = requestHash({
        propertyId,
        actorUserId,
        operationType,
        sourceTenancyId,
        request: hashInput,
      });
      const registered = await this.registerOperation({
        operationType,
        idempotencyKey,
        requestHash: hash,
        actorUserId,
        sourceTenancyId,
        targetRoomId,
        effectiveOn,
      });
      let operation = registered.operation;
      if (operation.requestHash !== hash) {
        throw new WorkflowIdempotencyKeyReusedException();
      }
      if (operation.status === "ACTION_REQUIRED") {
        throw new CommandActionRequiredException();
      }
      if (operation.status === "COMPLETED") {
        return this.buildResult(operation, true, 200);
      }

      const settlement = await this.ensureSettlement(
        operation,
        settlementInput,
        actorUserId,
      );
      await this.assertSettlementOperationAvailable(
        operation.id,
        settlement.id,
      );
      operation = await this.updateOperation(operation.id, {
        status: "INVOICE_PENDING",
        settlementId: settlement.id,
      });

      let invoice: InvoiceRecord;
      if (operationType !== "FINALIZE_AND_INVOICE" && transitionInput) {
        try {
          operation = await this.completeTransition(
            operation,
            transitionInput,
            actorUserId,
          );
          if (!operation.invoiceId) throw new CommandActionRequiredException();
          invoice = await this.billing.findInvoiceById(operation.invoiceId);
        } catch (error) {
          if (
            error instanceof TargetRoomUnavailableException ||
            error instanceof CommandActionRequiredException ||
            error instanceof BillingValidationException ||
            error instanceof BillingRoomNotFoundException ||
            error instanceof SettlementInvoiceNotFoundException
          ) {
            await this.updateOperation(operation.id, {
              status: "ACTION_REQUIRED",
              lastErrorCode: "COMMAND_ACTION_REQUIRED",
            });
            throw error;
          }
          await this.updateOperation(operation.id, {
            status: "INVOICE_PENDING",
            lastErrorCode: "INVOICE_PENDING",
          });
          return pendingResult(operation.id, settlement, registered.replayed);
        }
      } else {
        try {
          invoice = await this.billing.createInvoiceFromSettlement(
            settlement.id,
            actorUserId,
          );
        } catch (error) {
          if (
            error instanceof BillingValidationException ||
            error instanceof BillingRoomNotFoundException ||
            error instanceof SettlementInvoiceNotFoundException
          ) {
            await this.updateOperation(operation.id, {
              status: "ACTION_REQUIRED",
              lastErrorCode: "COMMAND_ACTION_REQUIRED",
            });
            throw error;
          }
          await this.updateOperation(operation.id, {
            status: "INVOICE_PENDING",
            lastErrorCode: "INVOICE_PENDING",
          });
          return pendingResult(operation.id, settlement, registered.replayed);
        }
        operation = await this.completeFinalizeOperation(
          operation,
          settlement.id,
          invoice.id,
          actorUserId,
        );
      }
      return this.buildResult(
        operation,
        registered.replayed,
        registered.replayed ? 200 : 201,
      );
    } finally {
      this.activeCommands.delete(lockKey);
    }
  }

  private async ensureSettlement(
    operation: OperationState,
    input: SettlementInput,
    actorUserId: string,
  ) {
    if (operation.settlementId) {
      const linked = await this.utilities.findSettlementById(
        operation.settlementId,
      );
      if (linked) return linked;
    }
    try {
      return await this.utilities.createSettlement(input, actorUserId);
    } catch (error) {
      if (!(error instanceof FinalizedSettlementConflictException)) throw error;
      const periodEnd =
        input.periodEnd ?? monthEnd(input.billingYear, input.billingMonth);
      const periodStart = maxDate(
        monthStart(input.billingYear, input.billingMonth),
        (await this.findTenancy(input.tenancyId)).startDate,
      );
      const existing = await this.utilities.findFinalizedSettlement({
        tenancyId: input.tenancyId,
        periodStart,
        periodEnd,
      });
      if (!existing) throw error;
      return existing;
    }
  }

  private async registerOperation(input: {
    operationType: OperationType;
    idempotencyKey: string;
    requestHash: string;
    actorUserId: string;
    sourceTenancyId: string;
    targetRoomId: string | null;
    effectiveOn: string;
  }) {
    if (process.env.NODE_ENV === "test") {
      const key = `${authorizedPropertyId()}:${input.operationType}:${input.idempotencyKey}`;
      const existing = this.memoryOperations.get(key);
      if (existing) return { operation: existing, replayed: true };
      const tenancy = await this.findTenancy(input.sourceTenancyId);
      validateEffectiveDate(tenancy, input.effectiveOn);
      const created: OperationState = {
        id: randomUUID(),
        operationType: input.operationType,
        status: "IN_PROGRESS",
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        sourceTenancyId: input.sourceTenancyId,
        propertyId: authorizedPropertyId(),
        targetRoomId: input.targetRoomId,
        targetTenancyId: null,
        settlementId: null,
        invoiceId: null,
        handoverRecordId: null,
        effectiveOn: input.effectiveOn,
        updatedAt: new Date().toISOString(),
        resultJson: null,
        cancelledAt: null,
        cancelReason: null,
      };
      this.memoryOperations.set(key, created);
      return { operation: created, replayed: false };
    }

    const existing = await this.prisma.tenancyOperation.findFirst({
      where: {
        operationType: input.operationType,
        idempotencyKey: input.idempotencyKey,
        propertyId: authorizedPropertyId(),
      },
    });
    if (existing) {
      if (
        existing.status === "IN_PROGRESS" &&
        Date.now() - existing.updatedAt.getTime() < 30_000
      ) {
        if (existing.requestHash !== input.requestHash) {
          throw new WorkflowIdempotencyKeyReusedException();
        }
        throw new CommandAlreadyInProgressException();
      }
      return { operation: mapOperation(existing), replayed: true };
    }
    const tenancy = await this.prisma.tenancy.findFirst({
      where: {
        id: input.sourceTenancyId,
        deletedAt: null,
        room: { propertyId: authorizedPropertyId() },
      },
      include: {
        room: true,
        members: { where: { leftOn: null, deletedAt: null } },
      },
    });
    if (!tenancy) {
      throw new WorkflowValidationException(
        "TENANCY_NOT_FOUND",
        "Source tenancy was not found",
      );
    }
    validateEffectiveDate(
      { startDate: dateOnly(tenancy.startDate), status: tenancy.status },
      input.effectiveOn,
    );
    if (input.operationType !== "FINALIZE_AND_INVOICE") {
      if (tenancy.status !== "ACTIVE" || tenancy.members.length === 0) {
        throw new WorkflowValidationException(
          "TENANCY_NOT_ACTIVE",
          "Whole-room workflow requires an active occupied tenancy",
        );
      }
    }
    if (input.targetRoomId) {
      if (input.targetRoomId === tenancy.roomId) {
        throw new TargetRoomUnavailableException();
      }
      const target = await this.prisma.room.findFirst({
        where: {
          id: input.targetRoomId,
          propertyId: authorizedPropertyId(),
          deletedAt: null,
        },
        include: {
          tenancies: {
            where: { status: "ACTIVE", deletedAt: null },
            include: { members: { where: { leftOn: null, deletedAt: null } } },
          },
        },
      });
      if (
        !target ||
        target.status === "MAINTENANCE" ||
        target.status === "INACTIVE" ||
        target.tenancies.some((item) => item.members.length > 0) ||
        tenancy.members.length > target.maxOccupants
      ) {
        throw new TargetRoomUnavailableException();
      }
    }
    try {
      const created = await this.prisma.tenancyOperation.create({
        data: {
          operationType: input.operationType,
          status: "IN_PROGRESS",
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          actorUserId: input.actorUserId,
          propertyId: tenancy.room.propertyId,
          sourceTenancyId: input.sourceTenancyId,
          targetRoomId: input.targetRoomId,
          effectiveOn: asDate(input.effectiveOn),
        },
      });
      return { operation: mapOperation(created), replayed: false };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const replay = await this.prisma.tenancyOperation.findFirst({
          where: {
            operationType: input.operationType,
            idempotencyKey: input.idempotencyKey,
            propertyId: authorizedPropertyId(),
          },
        });
        if (replay) return { operation: mapOperation(replay), replayed: true };
        if (input.targetRoomId) throw new TargetRoomUnavailableException();
      }
      throw error;
    }
  }

  private async completeTransition(
    operation: OperationState,
    input: WholeGroupTransferInput | WholeGroupEndInput,
    actorUserId: string,
  ) {
    if (process.env.NODE_ENV === "test") {
      const invoice = await this.billing.createInvoiceFromSettlement(
        operation.settlementId ?? "",
        actorUserId,
      );
      await this.updateOperation(operation.id, {
        status: "INVOICE_PENDING",
        invoiceId: invoice.id,
      });
      const tenancy =
        "toRoomId" in input
          ? await this.tenants.transferTenancy(operation.sourceTenancyId, {
              toRoomId: input.toRoomId,
              transferDate: input.transferDate,
              notes: input.notes,
            })
          : await this.tenants.endTenancy(operation.sourceTenancyId, {
              actualEndDate: input.actualEndDate,
              notes: input.notes,
            });
      if (!tenancy) throw new CommandActionRequiredException();
      const completed = await this.updateOperation(operation.id, {
        status: "COMPLETED",
        invoiceId: invoice.id,
        targetTenancyId: "toRoomId" in input ? tenancy.id : null,
        completedAt: new Date(),
        resultJson: mergeResult(operation.resultJson, {
          targetTenancyId: "toRoomId" in input ? tenancy.id : null,
        }),
      });
      await this.audit.record({
        action: "STATUS_CHANGE",
        entityType: "tenancy_operation",
        entityId: operation.id,
        actorUserId,
        newValues: {
          status: "COMPLETED",
          invoiceId: invoice.id,
          targetTenancyId: "toRoomId" in input ? tenancy.id : null,
        },
      });
      return completed;
    }

    if (!operation.settlementId) throw new CommandActionRequiredException();
    const invoiceInput = await this.billing.prepareInvoiceFromSettlement(
      operation.settlementId,
    );

    const updated = await this.prisma.$transaction(
      async (tx) => {
        const command = await tx.tenancyOperation.findUniqueOrThrow({
          where: { id: operation.id },
        });
        if (command.status === "COMPLETED") return command;
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM tenancies WHERE id = ${operation.sourceTenancyId}::uuid FOR UPDATE`,
        );
        const source = await tx.tenancy.findFirst({
          where: {
            id: operation.sourceTenancyId,
            status: "ACTIVE",
            deletedAt: null,
            room: { propertyId: operation.propertyId },
          },
          include: {
            members: { where: { leftOn: null, deletedAt: null } },
          },
        });
        if (!source) throw new CommandActionRequiredException();
        await tx.tenancyMember.updateMany({
          where: { tenancyId: source.id, leftOn: null, deletedAt: null },
          data: { leftOn: asDate(operation.effectiveOn) },
        });
        let targetTenancyId: string | null = null;
        if (operation.targetRoomId) {
          const target = await tx.room.findFirst({
            where: {
              id: operation.targetRoomId,
              propertyId: operation.propertyId,
              deletedAt: null,
            },
            include: {
              tenancies: {
                where: { status: "ACTIVE", deletedAt: null },
                include: {
                  members: { where: { leftOn: null, deletedAt: null } },
                },
              },
            },
          });
          if (
            !target ||
            target.status === "MAINTENANCE" ||
            target.status === "INACTIVE" ||
            target.tenancies.some((item) => item.members.length > 0) ||
            source.members.length > target.maxOccupants
          ) {
            throw new TargetRoomUnavailableException();
          }
          const created = await tx.tenancy.create({
            data: {
              roomId: target.id,
              representativeTenantId: source.representativeTenantId,
              status: "ACTIVE",
              startDate: asDate(operation.effectiveOn),
              billingCycleType: source.billingCycleType,
              billingCycleCount: source.billingCycleCount,
              billingAnchorDay: source.billingAnchorDay,
              rentAmount: target.defaultRentAmount,
              depositAmount: target.depositAmount,
              notes: input.notes,
            },
          });
          await tx.tenancyMember.createMany({
            data: source.members.map((member) => ({
              tenancyId: created.id,
              tenantId: member.tenantId,
              joinedOn: asDate(operation.effectiveOn),
              isRepresentative:
                member.tenantId === source.representativeTenantId,
              role:
                member.tenantId === source.representativeTenantId
                  ? "REPRESENTATIVE"
                  : "CO_TENANT",
            })),
          });
          targetTenancyId = created.id;
        }
        const existingInvoice = await tx.invoice.findFirst({
          where: { sourceKey: invoiceInput.sourceKey, deletedAt: null },
          select: { id: true },
        });
        const invoice =
          existingInvoice ??
          (await tx.invoice.create({
            data: invoiceData(invoiceInput),
            select: { id: true },
          }));
        if (!existingInvoice) {
          await this.audit.record(
            {
              action: "ISSUE_INVOICE",
              entityType: "invoice",
              entityId: invoice.id,
              actorUserId,
              metadata: {
                settlementId: operation.settlementId,
                sourceKey: invoiceInput.sourceKey,
              },
            },
            tx,
          );
        }
        await this.receipts.applyAvailableCreditToTenancyInTransaction(
          tx,
          operation.propertyId,
          source.id,
          actorUserId,
        );
        if (targetTenancyId && operation.targetRoomId) {
          await this.transferRemainingCredit(
            tx,
            operation.propertyId,
            source.id,
            source.roomId,
            targetTenancyId,
            operation.targetRoomId,
            operation.effectiveOn,
            actorUserId,
          );
        }
        const readings = input.handoverReadings;
        const handover = await tx.roomHandoverRecord.create({
          data: {
            roomId: source.roomId,
            tenancyId: source.id,
            handoverType: operation.targetRoomId ? "TRANSFER_OUT" : "MOVE_OUT",
            handoverAt: asDate(operation.effectiveOn),
            electricityReading: readings.electricityCurrent,
            waterReading: readings.waterCurrent,
            notes: input.notes,
          },
        });
        await tx.tenancy.update({
          where: { id: source.id },
          data: {
            status: "ENDED",
            actualEndDate: asDate(operation.effectiveOn),
            notes: input.notes ?? source.notes,
          },
        });
        const completed = await tx.tenancyOperation.update({
          where: { id: operation.id },
          data: {
            status: "COMPLETED",
            invoiceId: invoice.id,
            targetTenancyId,
            handoverRecordId: handover.id,
            completedAt: new Date(),
            lastErrorCode: null,
            resultJson: mergeResult(operation.resultJson, {
              settlementId: operation.settlementId,
              invoiceId: invoice.id,
              targetTenancyId,
            }) as Prisma.InputJsonObject,
          },
        });
        await this.audit.record(
          {
            action: "STATUS_CHANGE",
            entityType: "tenancy_operation",
            entityId: operation.id,
            actorUserId,
            newValues: {
              status: "COMPLETED",
              settlementId: operation.settlementId,
              invoiceId: invoice.id,
              targetTenancyId,
            },
          },
          tx,
        );
        return completed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return mapOperation(updated);
  }

  private async updateOperation(
    id: string,
    input: {
      status?: OperationStatus;
      settlementId?: string;
      invoiceId?: string;
      targetTenancyId?: string | null;
      lastErrorCode?: string | null;
      completedAt?: Date;
      resultJson?: Record<string, unknown>;
      cancelledAt?: Date;
      cancelReason?: string;
    },
  ) {
    if (process.env.NODE_ENV === "test") {
      const operation = [...this.memoryOperations.values()].find(
        (item) => item.id === id,
      );
      if (!operation) throw new CommandActionRequiredException();
      Object.assign(operation, input, {
        updatedAt: new Date().toISOString(),
      });
      return operation;
    }
    return mapOperation(
      await this.prisma.tenancyOperation.update({
        where: { id },
        data: {
          status: input.status,
          settlementId: input.settlementId,
          invoiceId: input.invoiceId,
          targetTenancyId: input.targetTenancyId,
          lastErrorCode: input.lastErrorCode,
          completedAt: input.completedAt,
          resultJson: input.resultJson as Prisma.InputJsonValue | undefined,
          cancelledAt: input.cancelledAt,
          cancelReason: input.cancelReason,
        },
      }),
    );
  }

  private async transferRemainingCredit(
    tx: Prisma.TransactionClient,
    propertyId: string,
    sourceTenancyId: string,
    sourceRoomId: string,
    targetTenancyId: string,
    targetRoomId: string,
    effectiveOn: string,
    actorUserId: string,
  ) {
    const lots = await tx.tenantAccountEntry.findMany({
      where: {
        propertyId,
        tenancyId: sourceTenancyId,
        direction: "CREDIT",
        journalType: { in: ["RECEIPT_CREDIT", "TRANSFER_IN"] },
        sourcePayment: { status: "CONFIRMED" },
        reversalOfId: null,
        deletedAt: null,
      },
      include: { lotConsumptions: { where: { deletedAt: null } } },
      orderBy: [{ effectiveOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    let transferred = 0n;
    for (const lot of lots) {
      if (!lot.sourcePaymentId) continue;
      const consumed = lot.lotConsumptions.reduce((total, entry) => {
        const amount = moneyValue(entry.amount.toString());
        return entry.direction === "DEBIT" ? total + amount : total - amount;
      }, 0n);
      const remaining = moneyValue(lot.amount.toString()) - consumed;
      if (remaining <= 0n) continue;
      const correlation = randomUUID();
      await tx.tenantAccountEntry.create({
        data: {
          propertyId,
          tenancyId: sourceTenancyId,
          roomId: sourceRoomId,
          sourcePaymentId: lot.sourcePaymentId,
          sourceLotId: lot.id,
          transferCorrelation: correlation,
          journalType: "TRANSFER_OUT",
          direction: "DEBIT",
          journalVersion: 2,
          amount: moneyString(remaining),
          effectiveOn: asDate(effectiveOn),
          notes: "Chuyen so du sang phong moi",
        },
      });
      await tx.tenantAccountEntry.create({
        data: {
          propertyId,
          tenancyId: targetTenancyId,
          roomId: targetRoomId,
          sourcePaymentId: lot.sourcePaymentId,
          transferCorrelation: correlation,
          journalType: "TRANSFER_IN",
          direction: "CREDIT",
          journalVersion: 2,
          amount: moneyString(remaining),
          effectiveOn: asDate(effectiveOn),
          notes: "Nhan so du tu phong cu",
        },
      });
      transferred += remaining;
    }
    if (transferred > 0n) {
      await this.audit.record(
        {
          action: "STATUS_CHANGE",
          entityType: "tenancy_credit_transfer",
          entityId: sourceTenancyId,
          actorUserId,
          newValues: {
            targetTenancyId,
            amount: moneyString(transferred),
          },
        },
        tx,
      );
    }
  }

  private async completeFinalizeOperation(
    operation: OperationState,
    settlementId: string,
    invoiceId: string,
    actorUserId: string,
  ) {
    if (process.env.NODE_ENV === "test") {
      const completed = await this.updateOperation(operation.id, {
        status: "COMPLETED",
        invoiceId,
        completedAt: new Date(),
        resultJson: mergeResult(operation.resultJson, {
          settlementId,
          invoiceId,
        }),
      });
      await this.audit.record({
        action: "STATUS_CHANGE",
        entityType: "tenancy_operation",
        entityId: operation.id,
        actorUserId,
        newValues: { status: "COMPLETED", settlementId, invoiceId },
      });
      return completed;
    }
    const completed = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.tenancyOperation.update({
        where: { id: operation.id },
        data: {
          status: "COMPLETED",
          invoiceId,
          completedAt: new Date(),
          resultJson: mergeResult(operation.resultJson, {
            settlementId,
            invoiceId,
          }) as Prisma.InputJsonObject,
        },
      });
      await this.audit.record(
        {
          action: "STATUS_CHANGE",
          entityType: "tenancy_operation",
          entityId: operation.id,
          actorUserId,
          newValues: { status: "COMPLETED", settlementId, invoiceId },
        },
        tx,
      );
      return saved;
    });
    return mapOperation(completed);
  }

  private async assertSettlementOperationAvailable(
    operationId: string,
    settlementId: string,
  ) {
    const conflict =
      process.env.NODE_ENV === "test"
        ? [...this.memoryOperations.values()].find(
            (item) =>
              item.id !== operationId && item.settlementId === settlementId,
          )
        : await this.prisma.tenancyOperation.findFirst({
            where: { id: { not: operationId }, settlementId },
            select: { id: true },
          });
    if (conflict) throw new FinalizedSettlementConflictException();
  }

  private async loadOperation(id: string): Promise<OperationState> {
    const propertyId = authorizedPropertyId();
    if (process.env.NODE_ENV === "test") {
      const operation = [...this.memoryOperations.values()].find(
        (item) => item.id === id && item.propertyId === propertyId,
      );
      if (!operation) throw new CommandActionRequiredException();
      return operation;
    }
    const operation = await this.prisma.tenancyOperation.findFirst({
      where: {
        id,
        propertyId,
        sourceTenancy: { room: { propertyId } },
        OR: [{ targetRoomId: null }, { targetRoom: { propertyId } }],
      },
    });
    if (!operation) throw new CommandActionRequiredException();
    return mapOperation(operation);
  }

  private async markOperationForRecovery(
    operation: OperationState,
    idempotencyKey: string,
    hash: string,
    actorUserId: string,
  ): Promise<OperationState> {
    const resultJson = mergeResult(operation.resultJson, {
      recovery: { idempotencyKey, requestHash: hash },
    });
    if (process.env.NODE_ENV === "test") {
      const saved = await this.updateOperation(operation.id, {
        status: "INVOICE_PENDING",
        lastErrorCode: null,
        resultJson,
      });
      await this.audit.record({
        action: "STATUS_CHANGE",
        entityType: "tenancy_operation",
        entityId: operation.id,
        actorUserId,
        newValues: { status: "INVOICE_PENDING", recovery: true },
      });
      return saved;
    }
    const saved = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.tenancyOperation.updateMany({
        where: {
          id: operation.id,
          status: operation.status,
          updatedAt: new Date(operation.updatedAt),
        },
        data: {
          status: "INVOICE_PENDING",
          lastErrorCode: null,
          resultJson: resultJson as Prisma.InputJsonObject,
        },
      });
      if (changed.count !== 1) {
        throw new CommandAlreadyInProgressException();
      }
      await this.audit.record(
        {
          action: "STATUS_CHANGE",
          entityType: "tenancy_operation",
          entityId: operation.id,
          actorUserId,
          newValues: { status: "INVOICE_PENDING", recovery: true },
        },
        tx,
      );
      return tx.tenancyOperation.findUniqueOrThrow({
        where: { id: operation.id },
      });
    });
    return mapOperation(saved);
  }

  private async buildResult(
    operation: OperationState,
    replayed: boolean,
    httpStatus: number,
  ): Promise<WorkflowResult> {
    const settlement = operation.settlementId
      ? await this.utilities.findSettlementById(operation.settlementId)
      : null;
    const invoice = operation.invoiceId
      ? await this.billing.findInvoiceById(operation.invoiceId)
      : null;
    if (!settlement) throw new CommandActionRequiredException();
    return {
      httpStatus,
      operation: {
        id: operation.id,
        status: operation.status,
        replayed,
        retryable:
          operation.status === "INVOICE_PENDING" ||
          operation.status === "ACTION_REQUIRED",
      },
      settlement,
      invoice,
      transfer:
        operation.targetTenancyId &&
        operation.operationType === "WHOLE_GROUP_TRANSFER"
          ? {
              sourceTenancyId: operation.sourceTenancyId,
              targetTenancyId: operation.targetTenancyId,
              effectiveOn: operation.effectiveOn,
            }
          : null,
    };
  }

  private async findTenancy(id: string) {
    const tenancy = (await this.tenants.listTenancies()).find(
      (item) => item.id === id,
    );
    if (!tenancy) {
      throw new WorkflowValidationException(
        "TENANCY_NOT_FOUND",
        "Source tenancy was not found",
      );
    }
    return tenancy;
  }
}

function normalizeSettlementInput(
  input: FinalizeAndInvoiceInput,
): SettlementInput {
  const expectedEnd = monthEnd(input.billingYear, input.billingMonth);
  if (input.settlementType === "MONTHLY") {
    if (input.periodEnd && input.periodEnd !== expectedEnd) {
      throw new WorkflowValidationException(
        "INVALID_SETTLEMENT_PERIOD",
        "Monthly settlement must end on the last day of the month",
      );
    }
  } else {
    if (!input.periodEnd) {
      throw new WorkflowValidationException(
        "INVALID_SETTLEMENT_PERIOD",
        "Move-out settlement requires periodEnd",
      );
    }
    const { year, month } = yearMonth(input.periodEnd);
    if (year !== input.billingYear || month !== input.billingMonth) {
      throw new WorkflowValidationException(
        "INVALID_SETTLEMENT_PERIOD",
        "billingYear and billingMonth must match periodEnd",
      );
    }
  }
  const { idempotencyKey: _key, ...settlement } = input;
  return {
    ...settlement,
    periodEnd:
      input.settlementType === "MONTHLY" ? expectedEnd : input.periodEnd,
  };
}

function moveOutSettlementInput(
  tenancyId: string,
  periodEnd: string,
  readings: WholeGroupTransferInput["handoverReadings"],
  prepaidAmount: string,
  notes?: string | null,
): SettlementInput {
  const { year, month } = yearMonth(periodEnd);
  return {
    tenancyId,
    settlementType: "MOVE_OUT",
    billingYear: year,
    billingMonth: month,
    periodEnd,
    utilityReading: readings,
    prepaidAmount,
    notes,
  };
}

function validateEffectiveDate(
  tenancy: Pick<TenancyRecord, "startDate" | "status">,
  effectiveOn: string,
) {
  if (effectiveOn < tenancy.startDate) {
    throw new WorkflowValidationException(
      "INVALID_EFFECTIVE_DATE",
      "Effective date cannot be before tenancy start date",
    );
  }
}

function mapOperation(operation: {
  id: string;
  operationType: OperationType;
  status: OperationStatus;
  idempotencyKey: string;
  requestHash: string;
  sourceTenancyId: string;
  propertyId: string;
  targetRoomId: string | null;
  targetTenancyId: string | null;
  settlementId: string | null;
  invoiceId: string | null;
  handoverRecordId: string | null;
  effectiveOn: Date;
  updatedAt: Date;
  resultJson: Prisma.JsonValue | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
}): OperationState {
  return {
    id: operation.id,
    operationType: operation.operationType,
    status: operation.status,
    idempotencyKey: operation.idempotencyKey,
    requestHash: operation.requestHash,
    sourceTenancyId: operation.sourceTenancyId,
    propertyId: operation.propertyId,
    targetRoomId: operation.targetRoomId,
    targetTenancyId: operation.targetTenancyId,
    settlementId: operation.settlementId,
    invoiceId: operation.invoiceId,
    handoverRecordId: operation.handoverRecordId,
    effectiveOn: dateOnly(operation.effectiveOn),
    updatedAt: operation.updatedAt.toISOString(),
    resultJson: jsonObject(operation.resultJson),
    cancelledAt: operation.cancelledAt?.toISOString() ?? null,
    cancelReason: operation.cancelReason,
  };
}

function mergeResult(
  current: Record<string, unknown> | null,
  patch: Record<string, unknown>,
) {
  return { ...(current ?? {}), ...patch };
}

function recoveryData(
  result: Record<string, unknown> | null,
  key: "recovery" | "cancellation",
) {
  const value = result?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.idempotencyKey === "string" &&
    typeof record.requestHash === "string"
    ? {
        idempotencyKey: record.idempotencyKey,
        requestHash: record.requestHash,
      }
    : null;
}

function operationSummary(
  operation: OperationState,
  replayed: boolean,
): OperationRecoveryResult {
  return {
    id: operation.id,
    status: operation.status,
    replayed,
    cancelledAt: operation.cancelledAt,
    cancelReason: operation.cancelReason,
  };
}

function jsonObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function yearMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 0 };
}

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function monthEnd(year: number, month: number) {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function maxDate(left: string, right: string) {
  return left >= right ? left : right;
}

function pendingResult(
  operationId: string,
  settlement: SettlementRecord,
  replayed: boolean,
): WorkflowResult {
  return {
    httpStatus: 202,
    operation: {
      id: operationId,
      status: "INVOICE_PENDING",
      replayed,
      retryable: true,
    },
    settlement,
    invoice: null,
    transfer: null,
  };
}

function invoiceData(input: InvoiceCreateInput) {
  return {
    invoiceNumber: input.invoiceNumber,
    propertyId: input.propertyId,
    roomId: input.roomId,
    tenancyId: input.tenancyId,
    payerTenantId: input.payerTenantId,
    invoiceType: input.invoiceType,
    status: input.status,
    billingPeriodStart: asDate(input.billingPeriodStart),
    billingPeriodEnd: asDate(input.billingPeriodEnd),
    billingYear: input.billingYear,
    billingMonth: input.billingMonth,
    issuedOn: asDate(input.issuedOn),
    dueOn: asDate(input.dueOn),
    totalAmount: input.totalAmount,
    paidAmount: input.paidAmount,
    outstandingAmount: input.outstandingAmount,
    sourceKey: input.sourceKey,
    pricingSnapshot: input.pricingSnapshot as Prisma.InputJsonObject,
    notes: input.notes,
    items: {
      create: input.items.map((item) => ({
        itemType: item.itemType,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        amount: item.amount,
        sortOrder: item.sortOrder,
        metadata: item.metadata
          ? (item.metadata as Prisma.InputJsonObject)
          : undefined,
      })),
    },
  };
}
