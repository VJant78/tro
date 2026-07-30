import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { parseRequest } from "../platform/validation.js";
import { DomainException } from "../platform/domain.exception.js";
import { Roles, type AppRole } from "../security/roles.decorator.js";
import { BillingService } from "./billing.service.js";
import {
  debtListQuerySchema,
  fromSettlementSchema,
  dashboardSummaryQuerySchema,
  idParamSchema,
  invoiceListQuerySchema,
  monthlyReportQuerySchema,
  paymentCreateSchema,
  paymentListQuerySchema,
} from "./billing.schemas.js";

interface RequestWithUser extends Request {
  user?: {
    id: string;
    role: AppRole;
  };
}

@Roles("OWNER", "MANAGER", "STAFF", "VIEWER")
@Controller()
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
  ) {}

  @Header("Cache-Control", "private, no-store")
  @Get("invoices")
  listInvoices(@Query() query: unknown) {
    return this.billing.listInvoices(
      parseRequest(invoiceListQuerySchema, query),
    );
  }

  @Header("Cache-Control", "private, no-store")
  @Get("invoices/:id")
  findInvoice(@Param() params: unknown) {
    const { id } = parseRequest(idParamSchema, params);
    return this.billing.findInvoiceDetailById(id);
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("invoices/from-settlement")
  async createInvoiceFromSettlement(
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const { settlementId } = parseRequest(fromSettlementSchema, body);
    const invoice = await this.billing.createInvoiceFromSettlement(
      settlementId,
      request.user?.id,
    );
    return this.billing.invoiceReadResponse(invoice);
  }

  @Get("payments")
  listPayments(@Query() query: unknown) {
    return this.billing.listPayments(
      parseRequest(paymentListQuerySchema, query),
    );
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("payments")
  createPayment(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyHeader: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const parsed = parseRequest(paymentCreateSchema, body);
    if (
      parsed.idempotencyKey &&
      idempotencyHeader &&
      parsed.idempotencyKey !== idempotencyHeader
    ) {
      throw new DomainException(
        "IDEMPOTENCY_KEY_MISMATCH",
        "Idempotency-Key header must match the request body",
        422,
      );
    }
    return this.billing.createPayment(
      {
        ...parsed,
        idempotencyKey: parsed.idempotencyKey ?? idempotencyHeader ?? null,
        paidAt: parsed.paidAt,
      },
      request.user?.id,
    );
  }

  @Get("debts")
  listDebts(@Query() query: unknown) {
    return this.billing.listDebts(parseRequest(debtListQuerySchema, query));
  }

  @Get("dashboard/summary")
  dashboardSummary(@Query() query: unknown) {
    return this.billing.dashboardSummary(
      parseRequest(dashboardSummaryQuerySchema, query),
    );
  }

  @Get("dashboard/actions")
  dashboardActions(@Query() query: unknown) {
    return this.billing.dashboardActions(
      parseRequest(dashboardSummaryQuerySchema, query),
    );
  }

  @Header("Cache-Control", "private, no-store")
  @Get("reports/monthly")
  monthlyReport(@Query() query: unknown) {
    return this.billing.monthlyReport(
      parseRequest(monthlyReportQuerySchema, query),
    );
  }

  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Cache-Control", "private, no-store")
  @Get("reports/monthly.csv")
  async monthlyReportCsv(@Query() query: unknown) {
    return this.billing.monthlyReportCsv(
      parseRequest(monthlyReportQuerySchema, query),
    );
  }
}
