import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { getRequestId } from "./request-context.js";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException
        ? this.messageForException(exception)
        : "Internal server error";
    const requestId = getRequestId();

    if (!(exception instanceof HttpException)) {
      console.error(
        JSON.stringify({
          level: "error",
          message,
          requestId,
          errorName:
            exception instanceof Error ? exception.name : "UnknownError",
          errorMessage:
            exception instanceof Error ? exception.message : "Unknown error",
        }),
      );
    }

    response.status(status).json({
      error: {
        code: this.codeForStatus(status),
        message,
        requestId,
        details:
          exception instanceof HttpException
            ? this.detailsForException(exception)
            : undefined,
      },
    });
  }

  private messageForException(exception: HttpException) {
    const response = exception.getResponse();
    if (
      typeof response === "object" &&
      response !== null &&
      "message" in response &&
      typeof response.message === "string"
    ) {
      return response.message;
    }

    return exception.message;
  }

  private detailsForException(exception: HttpException) {
    const response = exception.getResponse();
    if (
      typeof response === "object" &&
      response !== null &&
      "details" in response &&
      Array.isArray(response.details)
    ) {
      return response.details;
    }

    return undefined;
  }

  private codeForStatus(status: number) {
    if (status === 401) return "UNAUTHENTICATED";
    if (status === 403) return "FORBIDDEN";
    if (status === 404) return "NOT_FOUND";
    if (status === 409) return "CONFLICT";
    if (status === 422 || status === 400) return "VALIDATION_ERROR";
    return "INTERNAL_ERROR";
  }
}
