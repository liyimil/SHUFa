import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module.js";
import { createOpenApiDocument } from "./openapi-document.js";
import {
  corsConfiguration,
  requestMetadataMiddleware,
} from "./http-boundary.js";
import { validateRuntimeConfiguration } from "./runtime-config.js";

async function bootstrap(): Promise<void> {
  validateRuntimeConfiguration();
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.API_PORT ?? 3001);

  app.use(requestMetadataMiddleware);
  app.enableCors(corsConfiguration(process.env.CORS_ORIGINS));
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
