import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { AuthGuard } from "../identity/auth.guard.js";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { AuthenticatedUser } from "../identity/identity.types.js";
import { PracticeService } from "./practice.service.js";

@ApiTags("practice")
@UseGuards(AuthGuard)
@Controller()
export class PracticeController {
  constructor(
    @Inject(PracticeService) private readonly service: PracticeService,
  ) {}

  @Post("practices")
  @ApiOperation({ summary: "以本人作品和已发布同字范字创建练习记录" })
  createPractice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.createPractice(user.id, body);
  }

  @Get("practices")
  listPractices(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listPractices(user.id);
  }

  @Get("practices/:sessionId")
  getPractice(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId") sessionId: string,
  ) {
    return this.service.getPractice(user.id, sessionId);
  }

  @Post("practices/:sessionId/attempts")
  addAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId") sessionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.addAttempt(user.id, sessionId, body);
  }

  @Patch("practices/:sessionId/glyph")
  @ApiOperation({ summary: "切换练习会话的参考范字" })
  switchGlyph(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId") sessionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.switchGlyph(user.id, sessionId, body);
  }

  @Post("practices/:sessionId/shares")
  createShare(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId") sessionId: string,
  ) {
    return this.service.createShare(user.id, sessionId);
  }

  @Delete("shares/:shareId")
  revokeShare(
    @CurrentUser() user: AuthenticatedUser,
    @Param("shareId") shareId: string,
  ) {
    return this.service.revokeShare(user.id, shareId);
  }

  @Put("favorites/glyphs/:glyphId")
  favorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("glyphId") glyphId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.favorite(user.id, glyphId, body);
  }

  @Get("favorites")
  listFavorites(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listFavorites(user.id);
  }

  @Post("favorite-groups")
  createFavoriteGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.createFavoriteGroup(user.id, body);
  }

  @Patch("favorite-groups/:groupId")
  updateFavoriteGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param("groupId") groupId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updateFavoriteGroup(user.id, groupId, body);
  }

  @Delete("favorite-groups/:groupId")
  removeFavoriteGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param("groupId") groupId: string,
  ) {
    return this.service.removeFavoriteGroup(user.id, groupId);
  }

  @Post("favorite-groups/:groupId/reorder")
  reorderFavoriteGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param("groupId") groupId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.reorderFavoriteGroup(user.id, groupId, body);
  }

  @Post("favorites/glyphs/:glyphId/reorder")
  reorderFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("glyphId") glyphId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.reorderFavorite(user.id, glyphId, body);
  }

  @Delete("favorites/glyphs/:glyphId")
  unfavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("glyphId") glyphId: string,
  ) {
    return this.service.unfavorite(user.id, glyphId);
  }

  @Delete("artworks/:artworkId")
  deleteArtwork(
    @CurrentUser() user: AuthenticatedUser,
    @Param("artworkId") artworkId: string,
  ) {
    return this.service.deleteArtwork(user.id, artworkId);
  }

  @Get("artwork-deletions/:deletionId")
  getArtworkDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Param("deletionId") deletionId: string,
  ) {
    return this.service.getArtworkDeletion(user.id, deletionId);
  }
}
