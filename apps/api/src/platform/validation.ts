import { UnprocessableEntityException } from "@nestjs/common";
import { ZodError, type ZodType } from "zod";

export function parseRequest<T>(schema: ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new UnprocessableEntityException({
        message: "Request validation failed",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    throw error;
  }
}
