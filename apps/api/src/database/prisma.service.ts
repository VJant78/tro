import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Injectable, OnModuleDestroy } from "@nestjs/common";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/tro";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
      log:
        process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
