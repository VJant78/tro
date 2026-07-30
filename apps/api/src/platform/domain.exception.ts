import { HttpException, HttpStatus } from "@nestjs/common";

export class DomainException extends HttpException {
  constructor(
    code: string,
    message: string,
    status: HttpStatus = HttpStatus.CONFLICT,
    details: unknown[] = [],
  ) {
    super({ code, message, details }, status);
  }
}
