import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AnalysisController } from "./analysis.controller.js";
import { ANALYSIS_QUEUE, BullArtworkAnalysisQueue } from "./analysis.queue.js";
import { ANALYSIS_REPOSITORY } from "./analysis.repository.js";
import { AnalysisService } from "./analysis.service.js";
import { InternalAnalysisController } from "./internal-analysis.controller.js";
import { PrismaAnalysisRepository } from "./prisma-analysis.repository.js";

@Module({
  controllers: [AnalysisController, InternalAnalysisController],
  exports: [ANALYSIS_QUEUE],
  imports: [DatabaseModule, IdentityModule],
  providers: [
    AnalysisService,
    { provide: ANALYSIS_REPOSITORY, useClass: PrismaAnalysisRepository },
    { provide: ANALYSIS_QUEUE, useClass: BullArtworkAnalysisQueue },
  ],
})
export class AnalysisModule {}
