import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module.js";
import { GlobalExceptionFilter } from "./global-exception.filter.js";
import { createOpenApiDocument } from "./openapi-document.js";
import {
  corsConfiguration,
  helmetMiddleware,
  requestMetadataMiddleware,
} from "./http-boundary.js";
import { validateRuntimeConfiguration } from "./runtime-config.js";

async function bootstrap(): Promise<void> {
  validateRuntimeConfiguration();
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.API_PORT ?? 3001);

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.use(cookieParser());
  app.use(helmetMiddleware);
  app.use(requestMetadataMiddleware);
  app.enableCors({
    ...corsConfiguration(process.env.CORS_ORIGINS),
    credentials: true,
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
