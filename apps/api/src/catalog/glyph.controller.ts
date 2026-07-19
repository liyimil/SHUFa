import { Controller, Get, Inject, Param } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";

import { CatalogService } from "./catalog.service.js";
import type { PublishedGlyphDetail } from "./catalog.types.js";

@ApiTags("catalog")
@Controller("glyphs")
export class GlyphController {
  constructor(
    @Inject(CatalogService) private readonly service: CatalogService,
  ) {}

  @Get(":glyphId")
  @ApiOperation({ summary: "读取已发布范字的来源上下文，不暴露私有原帖对象" })
  @ApiParam({ name: "glyphId" })
  @ApiOkResponse({ description: "范字、来源版本、权利和原帖坐标上下文。" })
  getDetail(@Param("glyphId") glyphId: string): Promise<PublishedGlyphDetail> {
    return this.service.findPublishedGlyphDetail(glyphId);
  }
}
