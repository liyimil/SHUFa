import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { AdminAuthGuard } from "./admin-auth.guard.js";
import type { AdminPrincipal } from "./admin-auth.types.js";
import { CurrentStaff, RequireAdminRoles } from "./admin.decorators.js";
import { ContentAdminService } from "./content-admin.service.js";

@ApiTags("admin-content")
@UseGuards(AdminAuthGuard)
@Controller("admin/content")
export class ContentAdminController {
  constructor(
    @Inject(ContentAdminService) private readonly service: ContentAdminService,
  ) {}

  @Get("import-template")
  @RequireAdminRoles("EDITOR")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header(
    "Content-Disposition",
    'attachment; filename="calligraphy-glyph-import.csv"',
  )
  contentImportTemplate() {
    return this.service.contentImportTemplate();
  }

  @Get("import-batches")
  @RequireAdminRoles("EDITOR", "REVIEWER", "RIGHTS")
  listContentImportBatches() {
    return this.service.listContentImportBatches();
  }

  @Post("import-batches/preview")
  @RequireAdminRoles("EDITOR")
  previewContentImport(
    @CurrentStaff() staff: AdminPrincipal,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.previewContentImport(staff.email, body);
  }

  @Post("import-batches/:batchId/commit")
  @RequireAdminRoles("EDITOR")
  commitContentImport(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("batchId") batchId: string,
  ) {
    return this.service.commitContentImport(staff.email, batchId);
  }

  @Get("calligraphers")
  @RequireAdminRoles("EDITOR", "REVIEWER", "RIGHTS")
  @ApiOperation({ summary: "查看书家主数据" })
  listCalligraphers() {
    return this.service.listCalligraphers();
  }

  @Get("works")
  @RequireAdminRoles("EDITOR", "REVIEWER", "RIGHTS")
  @ApiOperation({ summary: "查看作品主数据" })
  listWorks() {
    return this.service.listWorks();
  }

  @Get("editions")
  @RequireAdminRoles("EDITOR", "REVIEWER", "RIGHTS")
  listEditions() {
    return this.service.listEditions();
  }

  @Get("rights")
  @RequireAdminRoles("EDITOR", "REVIEWER", "RIGHTS")
  listRights() {
    return this.service.listRights();
  }

  @Get("history")
  @RequireAdminRoles("EDITOR", "REVIEWER", "RIGHTS")
  listContentHistory(
    @Query("entityType") entityType: string | undefined,
    @Query("entityId") entityId: string | undefined,
  ) {
    return this.service.listContentHistory(entityType, entityId);
  }

  @Post("history/:auditId/restore")
  @RequireAdminRoles("EDITOR", "RIGHTS")
  restoreContentHistory(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("auditId") auditId: string,
  ) {
    return this.service.restoreContentHistory(
      staff.email,
      staff.roles,
      auditId,
    );
  }

  @Post("calligraphers")
  @RequireAdminRoles("EDITOR")
  @ApiOperation({ summary: "创建书家主数据并记录审计" })
  createCalligrapher(
    @CurrentStaff() staff: AdminPrincipal,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.createCalligrapher(staff.email, body);
  }

  @Patch("calligraphers/:calligrapherId")
  @RequireAdminRoles("EDITOR")
  updateCalligrapher(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("calligrapherId") calligrapherId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updateCalligrapher(staff.email, calligrapherId, body);
  }

  @Post("works")
  @RequireAdminRoles("EDITOR")
  @ApiOperation({ summary: "创建碑帖作品并记录审计" })
  createWork(
    @CurrentStaff() staff: AdminPrincipal,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.createWork(staff.email, body);
  }

  @Patch("works/:workId")
  @RequireAdminRoles("EDITOR")
  updateWork(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("workId") workId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updateWork(staff.email, workId, body);
  }

  @Post("editions")
  @RequireAdminRoles("EDITOR")
  @ApiOperation({ summary: "创建作品版本并记录审计" })
  createEdition(
    @CurrentStaff() staff: AdminPrincipal,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.createEdition(staff.email, body);
  }

  @Patch("editions/:editionId")
  @RequireAdminRoles("EDITOR")
  updateEdition(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("editionId") editionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updateEdition(staff.email, editionId, body);
  }

  @Post("rights")
  @RequireAdminRoles("RIGHTS")
  @ApiOperation({ summary: "创建权利记录并记录审计" })
  createRights(
    @CurrentStaff() staff: AdminPrincipal,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.createRights(staff.email, body);
  }

  @Patch("rights/:rightsId")
  @RequireAdminRoles("RIGHTS")
  updateRights(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("rightsId") rightsId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updateRights(staff.email, rightsId, body);
  }

  @Post("source-uploads")
  @RequireAdminRoles("EDITOR")
  @ApiOperation({ summary: "创建带大小、格式和校验值约束的原帖直传" })
  createSourceUpload(
    @CurrentStaff() staff: AdminPrincipal,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.createSourceUpload(staff.email, body);
  }

  @Post("source-uploads/:uploadId/complete")
  @RequireAdminRoles("EDITOR")
  @ApiOperation({ summary: "核验原帖直传并创建不可变来源资产" })
  completeSourceUpload(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("uploadId") uploadId: string,
  ) {
    return this.service.completeSourceUpload(staff.email, uploadId);
  }

  @Get("source-assets")
  @RequireAdminRoles("EDITOR", "REVIEWER", "RIGHTS")
  listSourceAssets() {
    return this.service.listSourceAssets();
  }

  @Get("source-assets/:sourceAssetId/view")
  @RequireAdminRoles("EDITOR", "REVIEWER")
  createSourceAssetView(@Param("sourceAssetId") sourceAssetId: string) {
    return this.service.createSourceAssetView(sourceAssetId);
  }

  @Get("segmentation-jobs")
  @RequireAdminRoles("EDITOR", "REVIEWER")
  listSegmentationJobs() {
    return this.service.listSegmentationJobs();
  }

  @Post("source-assets/:sourceAssetId/segmentation-jobs")
  @RequireAdminRoles("EDITOR")
  createSegmentationJob(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("sourceAssetId") sourceAssetId: string,
  ) {
    return this.service.createSegmentationJob(staff.email, sourceAssetId);
  }

  @Post("segmentation-candidates/:candidateId/accept")
  @RequireAdminRoles("EDITOR")
  acceptSegmentationCandidate(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("candidateId") candidateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.acceptSegmentationCandidate(
      staff.email,
      candidateId,
      body,
    );
  }

  @Post("segmentation-candidates/:candidateId/reject")
  @RequireAdminRoles("EDITOR")
  rejectSegmentationCandidate(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("candidateId") candidateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.rejectSegmentationCandidate(
      staff.email,
      candidateId,
      body,
    );
  }

  @Get("glyphs")
  @RequireAdminRoles("EDITOR", "REVIEWER", "RIGHTS")
  listGlyphs() {
    return this.service.listGlyphs();
  }

  @Post("glyphs")
  @RequireAdminRoles("EDITOR")
  @ApiOperation({ summary: "登记单字框并提交公开裁切任务" })
  createGlyph(
    @CurrentStaff() staff: AdminPrincipal,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.createGlyph(staff.email, body);
  }

  @Patch("glyphs/:glyphId")
  @RequireAdminRoles("EDITOR")
  @ApiOperation({ summary: "纠正未发布单字并使既有审核失效" })
  updateGlyph(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("glyphId") glyphId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updateGlyph(staff.email, glyphId, body);
  }

  @Post("glyphs/:glyphId/reviews")
  @RequireAdminRoles("REVIEWER")
  @ApiOperation({ summary: "以独立审核角色复核单字" })
  reviewGlyph(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("glyphId") glyphId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.reviewGlyph(staff.email, glyphId, body);
  }

  @Post("glyphs/:glyphId/publish")
  @RequireAdminRoles("REVIEWER")
  @ApiOperation({ summary: "在来源、权利、图片和审核均合格后发布单字" })
  publishGlyph(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("glyphId") glyphId: string,
  ) {
    return this.service.publishGlyph(staff.email, glyphId);
  }

  @Post("glyphs/:glyphId/unpublish")
  @RequireAdminRoles("REVIEWER", "RIGHTS")
  @ApiOperation({ summary: "立即下架已发布单字并记录原因" })
  unpublishGlyph(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("glyphId") glyphId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.unpublishGlyph(staff.email, glyphId, body);
  }
}
