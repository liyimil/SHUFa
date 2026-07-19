import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";

import { CatalogService } from "./catalog.service.js";
import type { CharacterGlyphResult } from "./catalog.types.js";

@ApiTags("catalog")
@Controller("characters")
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalogService: CatalogService,
  ) {}

  @Get(":character/glyphs")
  @ApiOperation({ summary: "查询一个汉字已发布且授权公开的名家范字" })
  @ApiParam({ name: "character", example: "永" })
  @ApiOkResponse({ description: "查询结果；没有可靠范字时 glyphs 为空数组。" })
  findGlyphs(
    @Param("character") character: string,
    @Query() query: Record<string, unknown>,
  ): Promise<CharacterGlyphResult> {
    return this.catalogService.findPublishedGlyphs(character, query);
  }
}
