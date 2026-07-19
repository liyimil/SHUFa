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
import { FeedbackService } from "./feedback.service.js";

@ApiTags("admin-feedback")
@UseGuards(AdminAuthGuard)
@Controller("admin/feedback")
export class AdminFeedbackController {
  constructor(
    @Inject(FeedbackService) private readonly service: FeedbackService,
  ) {}

  @Get()
  @RequireAdminRoles("EDITOR", "REVIEWER", "RIGHTS")
  @ApiOperation({ summary: "按类型和状态查看用户反馈工单" })
  list(@Query() query: Record<string, unknown>) {
    return this.service.listForAdmin(query);
  }

  @Patch(":feedbackId")
  @RequireAdminRoles("EDITOR", "REVIEWER", "RIGHTS")
  @ApiOperation({ summary: "分派、更新或关闭反馈工单" })
  update(
    @CurrentStaff() staff: AdminPrincipal,
    @Param("feedbackId") feedbackId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updateByAdmin(staff.email, feedbackId, body);
  }
}
