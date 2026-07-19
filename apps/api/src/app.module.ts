import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module.js";
import { AnalysisModule } from "./analysis/analysis.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { FeedbackModule } from "./feedback/feedback.module.js";
import { HealthController } from "./health/health.controller.js";
import { HealthService } from "./health/health.service.js";
import { IdentityModule } from "./identity/identity.module.js";
import { InsightsModule } from "./insights/insights.module.js";
import { PracticeModule } from "./practice/practice.module.js";
import { PrivacyModule } from "./privacy/privacy.module.js";
import { UploadModule } from "./upload/upload.module.js";

@Module({
  imports: [
    AdminModule,
    AnalysisModule,
    CatalogModule,
    FeedbackModule,
    IdentityModule,
    InsightsModule,
    PracticeModule,
    PrivacyModule,
    UploadModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
