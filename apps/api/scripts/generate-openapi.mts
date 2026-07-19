import "reflect-metadata";

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "../src/app.module.js";
import { createOpenApiDocument } from "../src/openapi-document.js";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

const outputPath = resolve(
  process.cwd(),
  "../../packages/api-contract/openapi.json",
);
const app = await NestFactory.create(AppModule, { logger: false });
try {
  app.setGlobalPrefix("api/v1");
  const content = `${JSON.stringify(stable(createOpenApiDocument(app)), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const existing = await readFile(outputPath, "utf8").catch(() => "");
    if (existing !== content) {
      console.error(
        "OpenAPI contract is stale. Run pnpm contract:generate and commit the result.",
      );
      process.exitCode = 1;
    }
  } else {
    await writeFile(outputPath, content, "utf8");
    console.log(`Wrote ${outputPath}`);
  }
} finally {
  await app.close();
}
