import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { AdminAuthService } from "./admin-auth.service.js";

@ApiTags("admin")
@Controller("admin/session")
export class AdminSessionController {
  constructor(
    @Inject(AdminAuthService) private readonly service: AdminAuthService,
  ) {}

  @Post()
  @ApiOperation({ summary: "登录内容管理后台" })
  createSession(@Body() body: Record<string, unknown>) {
    return this.service.createSession(body.email, body.password);
  }
}
