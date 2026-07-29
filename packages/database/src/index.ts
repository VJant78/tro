import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export { Prisma, PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __troPrismaClient: PrismaClient | undefined;
}

export const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/tro";

export function createPrismaClient(connectionString = databaseUrl) {
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalThis.__troPrismaClient ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__troPrismaClient = prisma;
}
