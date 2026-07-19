import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { AdminAuthGuard } from "../admin/admin-auth.guard.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AdminFeedbackController } from "./admin-feedback.controller.js";
import { FeedbackController } from "./feedback.controller.js";
import { FEEDBACK_REPOSITORY } from "./feedback.repository.js";
import { FeedbackService } from "./feedback.service.js";
import { PrismaFeedbackRepository } from "./prisma-feedback.repository.js";

@Module({
  controllers: [AdminFeedbackController, FeedbackController],
  imports: [DatabaseModule, IdentityModule],
  providers: [
    AdminAuthGuard,
    FeedbackService,
    { provide: FEEDBACK_REPOSITORY, useClass: PrismaFeedbackRepository },
  ],
})
export class FeedbackModule {}
