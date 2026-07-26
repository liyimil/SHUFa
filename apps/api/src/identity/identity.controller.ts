import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiCreatedResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { IdentityService } from "./identity.service.js";
import { AuthGuard } from "./auth.guard.js";
import { CurrentUser } from "./current-user.decorator.js";
import type { AuthenticatedUser, IdentitySession } from "./identity.types.js";

@ApiTags("identity")
@Controller("identity")
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identityService: IdentityService,
  ) {}

  @Post("anonymous")
  @ApiOperation({ summary: "建立匿名学习会话" })
  @ApiCreatedResponse({ description: "返回短期可撤销的访问令牌。" })
  createAnonymousSession(): Promise<IdentitySession> {
    return this.identityService.createAnonymousSession();
  }

  @Post("session")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "为仍有效的旧版访问令牌建立可轮换会话" })
  createRefreshableSession(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IdentitySession> {
    return this.identityService.createRefreshableSession(user);
  }

  @Post("refresh")
  @ApiOperation({ summary: "一次性轮换 Refresh Token 并签发新访问令牌" })
  refresh(@Body() body: Record<string, unknown>): Promise<IdentitySession> {
    return this.identityService.refreshSession(body.refreshToken);
  }

  @Post("revoke")
  @ApiOperation({ summary: "撤销一个 Refresh Token；结果不暴露令牌是否存在" })
  revoke(@Body() body: Record<string, unknown>) {
    return this.identityService.revokeSession(body.refreshToken);
  }

  @Post("sms/send")
  @ApiOperation({ summary: "发送手机验证码" })
  @ApiCreatedResponse({ description: "验证码已发送。" })
  sendSms(@Body() body: { phone: string }): Promise<{ sent: true }> {
    return this.identityService.sendVerificationCode(body.phone);
  }

  @Post("sms/verify")
  @ApiOperation({ summary: "验证手机验证码并登录/注册/升级匿名账号" })
  @ApiCreatedResponse({ description: "返回注册用户的访问令牌。" })
  verifySms(
    @Body()
    body: {
      anonymousRefreshToken?: string;
      code: string;
      phone: string;
    },
  ): Promise<IdentitySession> {
    return this.identityService.verifyPhoneLogin(
      body.phone,
      body.code,
      body.anonymousRefreshToken,
    );
  }
}
