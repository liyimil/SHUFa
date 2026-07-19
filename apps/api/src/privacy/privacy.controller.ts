import { Body, Controller, Get, Inject, Put, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { AuthGuard } from "../identity/auth.guard.js";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { AuthenticatedUser } from "../identity/identity.types.js";
import { PrivacyService } from "./privacy.service.js";

@ApiTags("privacy")
@UseGuards(AuthGuard)
@Controller("privacy/preferences")
export class PrivacyController {
  constructor(
    @Inject(PrivacyService) private readonly service: PrivacyService,
  ) {}

  @Get()
  @ApiOperation({ summary: "读取当前用户相互独立的存储、公开和训练授权" })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getPreferences(user.id);
  }

  @Put()
  @ApiOperation({ summary: "更新隐私授权并写入不可变授权审计记录" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updatePreferences(user.id, body);
  }
}
