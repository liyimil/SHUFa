import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { UploadModule } from "../upload/upload.module.js";
import { PrivacyModule } from "../privacy/privacy.module.js";
import { PracticeController } from "./practice.controller.js";
import {
  ARTWORK_DELETION_QUEUE,
  BullArtworkDeletionQueue,
} from "./artwork-deletion.queue.js";
import {
  BullPracticeAnalysisQueue,
  PRACTICE_ANALYSIS_QUEUE,
} from "./practice-analysis.queue.js";
import { PRACTICE_REPOSITORY } from "./practice.repository.js";
import { PracticeService } from "./practice.service.js";
import { PrismaPracticeRepository } from "./prisma-practice.repository.js";
import { PublicShareController } from "./public-share.controller.js";
import { InternalPracticeController } from "./internal-practice.controller.js";
import { InternalArtworkDeletionController } from "./internal-artwork-deletion.controller.js";

@Module({
  controllers: [
    InternalArtworkDeletionController,
    InternalPracticeController,
    PracticeController,
    PublicShareController,
  ],
  imports: [DatabaseModule, IdentityModule, PrivacyModule, UploadModule],
  providers: [
    PracticeService,
    { provide: ARTWORK_DELETION_QUEUE, useClass: BullArtworkDeletionQueue },
    { provide: PRACTICE_ANALYSIS_QUEUE, useClass: BullPracticeAnalysisQueue },
    { provide: PRACTICE_REPOSITORY, useClass: PrismaPracticeRepository },
  ],
})
export class PracticeModule {}
