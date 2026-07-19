import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

const localDatabaseUrl =
  "postgresql://calligraphy:calligraphy@localhost:5432/calligraphy";

function getDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production.");
  }

  return localDatabaseUrl;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = getDatabaseUrl();
    const adapter = new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 5_000,
    });

    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
