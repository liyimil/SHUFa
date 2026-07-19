import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { ContentAdminService } from "./content-admin.service.js";

@ApiExcludeController()
@Controller("internal/content")
export class InternalContentController {
  constructor(
    @Inject(ContentAdminService) private readonly service: ContentAdminService,
  ) {}

  @Post("glyphs/:glyphId/crop-result")
  recordGlyphCrop(
    @Param("glyphId") glyphId: string,
    @Headers("x-internal-token") token: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.recordGlyphCrop(glyphId, token, body);
  }

  @Post("segmentation-jobs/:jobId/started")
  markSegmentationProcessing(
    @Param("jobId") jobId: string,
    @Headers("x-internal-token") token: string | undefined,
  ) {
    return this.service.markSegmentationProcessing(jobId, token);
  }

  @Post("segmentation-jobs/:jobId/result")
  recordSegmentationResult(
    @Param("jobId") jobId: string,
    @Headers("x-internal-token") token: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.recordSegmentationResult(jobId, token, body);
  }

  @Post("segmentation-jobs/:jobId/failure")
  recordSegmentationFailure(
    @Param("jobId") jobId: string,
    @Headers("x-internal-token") token: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.recordSegmentationFailure(jobId, token, body);
  }
}
