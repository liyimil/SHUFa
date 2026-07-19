import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { AdminAuthGuard } from "../admin/admin-auth.guard.js";
import type { AdminPrincipal } from "../admin/admin-auth.types.js";
import { CurrentStaff, RequireAdminRoles } from "../admin/admin.decorators.js";
import { InsightsService } from "./insights.service.js";

@ApiTags("admin-insights")
@UseGuards(AdminAuthGuard)
@Controller("admin")
export class AdminInsightsController {
  constructor(
    @Inject(InsightsService) private readonly service: InsightsService,
  ) {}

  @Get("advice-reviews")
  @RequireAdminRoles("REVIEWER")
  @ApiOperation({ summary: "抽取有建议快照的练习样本供教师复核" })
  listAdviceSamples(@Query() query: Record<string, unknown>) {
    return this.service.listAdviceSamples(query);
  }

  @Patch("advice-reviews/:attemptId")
  @RequireAdminRoles("REVIEWER")
  @ApiOperation({ summary: "记录教师对结构建议的抽检结论与意见" })
  reviewAdvice(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("attemptId") attemptId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.reviewAdvice(staff.email, attemptId, body);
  }

  @Get("analytics/funnel")
  @RequireAdminRoles("EDITOR", "REVIEWER")
  @ApiOperation({ summary: "按时间窗统计完整练习闭环关键漏斗" })
  funnel(@Query() query: Record<string, unknown>) {
    return this.service.funnel(query);
  }
}
