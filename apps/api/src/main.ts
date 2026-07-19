import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { sanitizeHttpPath } from "@calligraphy/observability";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module.js";
import { createOpenApiDocument } from "./openapi-document.js";
import { validateRuntimeConfiguration } from "./runtime-config.js";

interface RequestMetadata {
  get(name: string): string | undefined;
  method: string;
  path: string;
}

interface ResponseMetadata {
  on(event: "finish", listener: () => void): void;
  setHeader(name: string, value: string): void;
  statusCode: number;
}

async function bootstrap(): Promise<void> {
  validateRuntimeConfiguration();
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.API_PORT ?? 3001);

  app.use(
    (
      request: RequestMetadata,
      response: ResponseMetadata,
      next: () => void,
    ): void => {
      const suppliedRequestId = request.get("x-request-id");
      const requestId =
        suppliedRequestId && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedRequestId)
          ? suppliedRequestId
          : randomUUID();
      const startedAt = performance.now();

      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("X-Frame-Options", "DENY");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );
      response.setHeader("X-Request-Id", requestId);
      response.on("finish", () => {
        console.log(
          JSON.stringify({
            durationMs: Math.round(performance.now() - startedAt),
            event: "http_request_completed",
            method: request.method,
            path: sanitizeHttpPath(request.path),
            requestId,
            statusCode: response.statusCode,
          }),
        );
      });
      next();
    },
  );

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(",") ?? [
      "http://localhost:3000",
      "http://localhost:3002",
    ],
  });
  app.setGlobalPrefix("api/v1");

  if (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_API_DOCS === "true"
  ) {
    SwaggerModule.setup("api/docs", app, createOpenApiDocument(app));
  }

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
