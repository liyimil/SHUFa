import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import { AuthGuard } from "../identity/auth.guard.js";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { AuthenticatedUser } from "../identity/identity.types.js";
import { AnalysisService } from "./analysis.service.js";
import type { ArtworkAnalysisView } from "./analysis.types.js";

@ApiTags("artworks")
@UseGuards(AuthGuard)
@Controller("artworks")
export class AnalysisController {
  constructor(
    @Inject(AnalysisService) private readonly service: AnalysisService,
  ) {}

  @Get(":artworkId")
  @ApiOperation({ summary: "查询本人作品及图片质检状态" })
  @ApiOkResponse({ description: "返回上传、处理状态和可解释质检结果。" })
  getArtwork(
    @CurrentUser() user: AuthenticatedUser,
    @Param("artworkId") artworkId: string,
  ): Promise<ArtworkAnalysisView> {
    return this.service.getArtwork(artworkId, user.id);
  }

  @Post(":artworkId/character")
  @ApiOperation({ summary: "确认本人作品中的汉字" })
  @ApiCreatedResponse({ description: "保存用户确认，作为后续范字检索依据。" })
  confirmCharacter(
    @CurrentUser() user: AuthenticatedUser,
    @Param("artworkId") artworkId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ character: string }> {
    return this.service.confirmCharacter(artworkId, user.id, body.character);
  }
}
