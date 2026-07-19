import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { CatalogController } from "./catalog.controller.js";
import { CATALOG_REPOSITORY } from "./catalog.repository.js";
import { CatalogService } from "./catalog.service.js";
import { PrismaCatalogRepository } from "./prisma-catalog.repository.js";
import { GlyphController } from "./glyph.controller.js";

@Module({
  controllers: [CatalogController, GlyphController],
  imports: [DatabaseModule],
  providers: [
    CatalogService,
    {
      provide: CATALOG_REPOSITORY,
      useClass: PrismaCatalogRepository,
    },
  ],
})
export class CatalogModule {}
