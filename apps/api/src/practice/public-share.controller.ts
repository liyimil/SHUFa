import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { PracticeService } from "./practice.service.js";

@ApiTags("shares")
@Controller("shares")
export class PublicShareController {
  constructor(
    @Inject(PracticeService) private readonly service: PracticeService,
  ) {}

  @Get(":token/summary")
  @ApiOperation({ summary: "查看不含用户图片地址的公开练习分享摘要" })
  getShareSummary(@Param("token") token: string) {
    return this.service.getPublicShareSummary(token);
  }

  @Get(":token")
  @ApiOperation({ summary: "查看未撤销且未过期的公开练习分享" })
  getShare(@Param("token") token: string) {
    return this.service.getPublicShare(token);
  }
}
