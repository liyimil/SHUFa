import { Module } from "@nestjs/common";

import { AnalysisModule } from "../analysis/analysis.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { PrivacyModule } from "../privacy/privacy.module.js";
import { OBJECT_STORAGE, S3ObjectStorage } from "./object-storage.js";
import { PrismaUploadRepository } from "./prisma-upload.repository.js";
import { UploadController } from "./upload.controller.js";
import { UPLOAD_REPOSITORY } from "./upload.repository.js";
import { UploadService } from "./upload.service.js";

@Module({
  controllers: [UploadController],
  exports: [OBJECT_STORAGE, UPLOAD_REPOSITORY, UploadService],
  imports: [AnalysisModule, DatabaseModule, IdentityModule, PrivacyModule],
  providers: [
    UploadService,
    { provide: UPLOAD_REPOSITORY, useClass: PrismaUploadRepository },
    { provide: OBJECT_STORAGE, useClass: S3ObjectStorage },
  ],
})
export class UploadModule {}
