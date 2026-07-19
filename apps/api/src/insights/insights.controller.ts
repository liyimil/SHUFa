import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { AuthGuard } from "../identity/auth.guard.js";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { AuthenticatedUser } from "../identity/identity.types.js";
import { InsightsService } from "./insights.service.js";

@ApiTags("product-events")
@UseGuards(AuthGuard)
@Controller("events")
export class InsightsController {
  constructor(
    @Inject(InsightsService) private readonly service: InsightsService,
  ) {}

  @Post()
  @ApiOperation({ summary: "幂等记录不含自由文本的核心业务事件" })
  track(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.trackEvent(user.id, body);
  }
}
