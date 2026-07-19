import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { AnalysisService } from "./analysis.service.js";

@ApiExcludeController()
@Controller("internal/analyses")
export class InternalAnalysisController {
  constructor(
    @Inject(AnalysisService) private readonly service: AnalysisService,
  ) {}

  @Post(":analysisId/result")
  recordResult(
    @Param("analysisId") analysisId: string,
    @Headers("x-internal-token") token: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.recordWorkerResult(analysisId, token, body);
  }

  @Post(":analysisId/failure")
  recordFailure(
    @Param("analysisId") analysisId: string,
    @Headers("x-internal-token") token: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.recordWorkerFailure(analysisId, token, body);
  }
}
