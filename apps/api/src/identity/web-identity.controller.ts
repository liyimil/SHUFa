import {
  Body,
  Controller,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";

import { IdentityService } from "./identity.service.js";
import type { IdentitySession } from "./identity.types.js";

const REFRESH_COOKIE_NAME = "calligraphy_rt";
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function setRefreshCookie(response: Response, refreshToken: string): void {
  response.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction(),
    path: "/api/v1/identity",
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction(),
    path: "/api/v1/identity",
  });
}

interface WebSessionResponse {
  accessToken: string;
  expiresInSeconds: number;
  user: IdentitySession["user"];
}

@ApiTags("identity")
@Controller("identity/web")
export class WebIdentityController {
  constructor(
    @Inject(IdentityService) private readonly identityService: IdentityService,
  ) {}

  @Post("anonymous")
  @ApiOperation({
    summary: "创建匿名会话并通过 HttpOnly Cookie 下发 Refresh Token",
  })
  async createAnonymousWebSession(
    @Res({ passthrough: true }) response: Response,
  ): Promise<WebSessionResponse> {
    const session = await this.identityService.createAnonymousSession();
    setRefreshCookie(response, session.refreshToken);
    return {
      accessToken: session.accessToken,
      expiresInSeconds: session.expiresInSeconds,
      user: session.user,
    };
  }

  @Post("refresh")
  @ApiOperation({ summary: "通过 HttpOnly Cookie 刷新会话" })
  async refreshWebSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WebSessionResponse> {
    const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: "REFRESH_TOKEN_REQUIRED",
        message: "Refresh token cookie is required.",
      });
    }
    const session = await this.identityService.refreshSession(refreshToken);
    setRefreshCookie(response, session.refreshToken);
    return {
      accessToken: session.accessToken,
      expiresInSeconds: session.expiresInSeconds,
      user: session.user,
    };
  }

  @Post("revoke")
  @ApiOperation({ summary: "撤销 HttpOnly Cookie 会话" })
  async revokeWebSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ revoked: true }> {
    const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      await this.identityService.revokeSession(refreshToken);
    }
    clearRefreshCookie(response);
    return { revoked: true };
  }

  @Post("sms/verify")
  @ApiOperation({ summary: "通过手机验证码登录并设置 HttpOnly Cookie" })
  async verifySmsWebSession(
    @Body() body: { code: string; phone: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WebSessionResponse> {
    const session = await this.identityService.verifyPhoneLogin(
      body.phone,
      body.code,
      request.cookies?.[REFRESH_COOKIE_NAME],
    );
    setRefreshCookie(response, session.refreshToken);
    return {
      accessToken: session.accessToken,
      expiresInSeconds: session.expiresInSeconds,
      user: session.user,
    };
  }
}
