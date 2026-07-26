import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

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

const rateLimitTtl = Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000);
const rateLimitLimit = Number(process.env.RATE_LIMIT_MAX ?? 100);

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: rateLimitTtl,
        limit: rateLimitLimit,
      },
    ]),
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
  providers: [
    HealthService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
