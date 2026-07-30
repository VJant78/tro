import "reflect-metadata";
import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { runWithRequestContext } from "./platform/request-context.js";

const apiPrefix = "/api/v1";

function corsOrigins() {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length
    ? configured
    : [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
}

export async function createApiApp() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = request.header("x-request-id") ?? `req_${randomUUID()}`;
    response.setHeader("x-request-id", requestId);
    runWithRequestContext({ requestId }, next);
  });
  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
  });
  app.setGlobalPrefix(apiPrefix.replace(/^\//, ""));

  return app;
}

export async function startApiApp() {
  const app = await createApiApp();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
  return app;
}
