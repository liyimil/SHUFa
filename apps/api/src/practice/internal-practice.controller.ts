import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { PracticeService } from "./practice.service.js";

@ApiExcludeController()
@Controller("internal/practice-attempts")
export class InternalPracticeController {
  constructor(
    @Inject(PracticeService) private readonly service: PracticeService,
  ) {}

  @Post(":attemptId/advice")
  recordAdvice(
    @Param("attemptId") attemptId: string,
    @Headers("x-internal-token") token: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.recordAdvice(attemptId, token, body);
  }

  @Post(":attemptId/advice/failure")
  recordAdviceFailure(
    @Param("attemptId") attemptId: string,
    @Headers("x-internal-token") token: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.recordAdviceFailure(attemptId, token, body);
  }
}
