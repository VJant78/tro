import { randomUUID } from "node:crypto";
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { runWithRequestContext } from "./request-context.js";

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<
      Request & { user?: { propertyId?: string } }
    >();
    const response = http.getResponse<Response>();
    const requestId = request.header("x-request-id") ?? `req_${randomUUID()}`;

    response.setHeader("x-request-id", requestId);

    return runWithRequestContext(
      {
        requestId,
        propertyId: request.user?.propertyId,
        ipAddress: request.ip,
        userAgent: request.header("user-agent"),
      },
      () => next.handle(),
    );
  }
}
