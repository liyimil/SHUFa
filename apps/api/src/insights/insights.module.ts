import { Module } from "@nestjs/common";

import { AdminAuthGuard } from "../admin/admin-auth.guard.js";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { UploadModule } from "../upload/upload.module.js";
import { AdminInsightsController } from "./admin-insights.controller.js";
import { InsightsController } from "./insights.controller.js";
import { INSIGHTS_REPOSITORY } from "./insights.repository.js";
import { InsightsService } from "./insights.service.js";
import { PrismaInsightsRepository } from "./prisma-insights.repository.js";

@Module({
  controllers: [AdminInsightsController, InsightsController],
  imports: [DatabaseModule, IdentityModule, UploadModule],
  providers: [
    AdminAuthGuard,
    InsightsService,
    { provide: INSIGHTS_REPOSITORY, useClass: PrismaInsightsRepository },
  ],
})
export class InsightsModule {}
