import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main(): Promise<void> {
  await prisma.character.upsert({
    where: { value: "永" },
    update: {},
    create: {
      value: "永",
      unicodeCodePoint: "U+6C38",
      radical: "水",
      structureType: "独体",
      frequencyRank: 1,
    },
  });

  console.log(
    "Seeded internal character metadata. No unverified calligraphy image was published.",
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
