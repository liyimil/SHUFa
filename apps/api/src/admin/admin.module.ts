import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { UploadModule } from "../upload/upload.module.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminSessionController } from "./admin-session.controller.js";
import { CONTENT_ADMIN_REPOSITORY } from "./content-admin.repository.js";
import { ContentAdminController } from "./content-admin.controller.js";
import { ContentAdminService } from "./content-admin.service.js";
import { PrismaContentAdminRepository } from "./prisma-content-admin.repository.js";
import { InternalContentController } from "./internal-content.controller.js";
import {
  HttpPublicCatalogInvalidator,
  PUBLIC_CATALOG_INVALIDATOR,
} from "./public-catalog-invalidator.js";
import {
  BullContentProcessingQueue,
  CONTENT_PROCESSING_QUEUE,
} from "./content-processing.queue.js";

@Module({
  controllers: [
    AdminSessionController,
    ContentAdminController,
    InternalContentController,
  ],
  imports: [DatabaseModule, IdentityModule, UploadModule],
  providers: [
    AdminAuthGuard,
    AdminAuthService,
    ContentAdminService,
    {
      provide: CONTENT_PROCESSING_QUEUE,
      useClass: BullContentProcessingQueue,
    },
    {
      provide: CONTENT_ADMIN_REPOSITORY,
      useClass: PrismaContentAdminRepository,
    },
    {
      provide: PUBLIC_CATALOG_INVALIDATOR,
      useClass: HttpPublicCatalogInvalidator,
    },
  ],
})
export class AdminModule {}
