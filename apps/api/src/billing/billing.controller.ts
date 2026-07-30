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

  @Get("invoices")
  listInvoices(@Query() query: unknown) {
    return this.billing.listInvoices(
      parseRequest(invoiceListQuerySchema, query),
    );
  }

  @Get("invoices/:id")
  findInvoice(@Param() params: unknown) {
    const { id } = parseRequest(idParamSchema, params);
    return this.billing.findInvoiceById(id);
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("invoices/from-settlement")
  createInvoiceFromSettlement(
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const { settlementId } = parseRequest(fromSettlementSchema, body);
    return this.billing.createInvoiceFromSettlement(
      settlementId,
      request.user?.id,
    );
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
    return this.billing.createPayment(
      {
        ...parsed,
        idempotencyKey: parsed.idempotencyKey ?? idempotencyHeader ?? null,
        paidAt: parsed.paidAt ?? new Date().toISOString(),
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

  @Get("reports/monthly")
  monthlyReport(@Query() query: unknown) {
    return this.billing.monthlyReport(
      parseRequest(monthlyReportQuerySchema, query),
    );
  }

  @Header("Content-Type", "text/csv; charset=utf-8")
  @Get("reports/monthly.csv")
  async monthlyReportCsv(@Query() query: unknown) {
    return this.billing.monthlyReportCsv(
      parseRequest(monthlyReportQuerySchema, query),
    );
  }
}
