import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { PrivacyController } from "./privacy.controller.js";
import { PRIVACY_REPOSITORY } from "./privacy.repository.js";
import { PrivacyService } from "./privacy.service.js";
import { PrismaPrivacyRepository } from "./prisma-privacy.repository.js";

@Module({
  controllers: [PrivacyController],
  exports: [PrivacyService],
  imports: [DatabaseModule, IdentityModule],
  providers: [
    PrivacyService,
    { provide: PRIVACY_REPOSITORY, useClass: PrismaPrivacyRepository },
  ],
})
export class PrivacyModule {}
