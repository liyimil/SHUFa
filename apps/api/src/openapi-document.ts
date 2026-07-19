import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { enhanceOpenApiDocument } from "./openapi-contract.js";

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("AI 辅助书法学习 API")
    .setDescription("移动端、Web 与管理后台共享的业务 API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  return enhanceOpenApiDocument(SwaggerModule.createDocument(app, config));
}
