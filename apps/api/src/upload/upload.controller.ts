import {
  Body,
  Controller,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiCreatedResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { AuthGuard } from "../identity/auth.guard.js";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { AuthenticatedUser } from "../identity/identity.types.js";
import { UploadService } from "./upload.service.js";
import type {
  CancelUploadResult,
  CompleteUploadResult,
  CreateUploadResult,
} from "./upload.types.js";

@ApiTags("uploads")
@UseGuards(AuthGuard)
@Controller("uploads")
export class UploadController {
  constructor(
    @Inject(UploadService) private readonly uploadService: UploadService,
  ) {}

  @Post()
  @ApiOperation({ summary: "创建用户作品直传会话" })
  @ApiCreatedResponse({ description: "返回短时效对象存储上传地址。" })
  createUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ): Promise<CreateUploadResult> {
    return this.uploadService.createUpload(user.id, body);
  }

  @Post(":uploadId/complete")
  @ApiOperation({ summary: "确认对象存储上传完成" })
  @ApiCreatedResponse({
    description: "服务端核验文件头、字节数、真实尺寸和完整解码后更新作品状态。",
  })
  completeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("uploadId") uploadId: string,
  ): Promise<CompleteUploadResult> {
    return this.uploadService.completeUpload(uploadId, user.id);
  }

  @Post(":uploadId/cancel")
  @ApiOperation({ summary: "取消尚未完成的直传并清理私有对象" })
  @ApiCreatedResponse({ description: "待上传作品已取消且私有对象已删除。" })
  cancelUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("uploadId") uploadId: string,
  ): Promise<CancelUploadResult> {
    return this.uploadService.cancelUpload(uploadId, user.id);
  }
}
