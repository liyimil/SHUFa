import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { AuthGuard } from "../identity/auth.guard.js";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { AuthenticatedUser } from "../identity/identity.types.js";
import { FeedbackService } from "./feedback.service.js";

@ApiTags("feedback")
@UseGuards(AuthGuard)
@Controller("feedback")
export class FeedbackController {
  constructor(
    @Inject(FeedbackService) private readonly service: FeedbackService,
  ) {}

  @Post()
  @ApiOperation({ summary: "提交结构提示、质检、内容或产品反馈" })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.submit(user.id, body);
  }

  @Get()
  @ApiOperation({ summary: "查看当前用户反馈的处理进度" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listForUser(user.id);
  }
}
