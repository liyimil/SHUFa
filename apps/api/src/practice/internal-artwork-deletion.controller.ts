import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { PracticeService } from "./practice.service.js";

@ApiExcludeController()
@Controller("internal/artwork-deletions")
export class InternalArtworkDeletionController {
  constructor(
    @Inject(PracticeService) private readonly service: PracticeService,
  ) {}

  @Post(":deletionId/complete")
  complete(
    @Param("deletionId") deletionId: string,
    @Headers("x-internal-token") token: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.completeArtworkDeletion(deletionId, token, body);
  }

  @Post(":deletionId/failure")
  fail(
    @Param("deletionId") deletionId: string,
    @Headers("x-internal-token") token: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.failArtworkDeletion(deletionId, token, body);
  }
}
