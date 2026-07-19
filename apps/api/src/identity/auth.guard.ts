import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import {
  IDENTITY_REPOSITORY,
  type IdentityRepository,
} from "./identity.repository.js";
import type {
  AccessTokenPayload,
  AuthenticatedUser,
} from "./identity.types.js";

interface RequestWithUser {
  headers: { authorization?: string };
  user?: AuthenticatedUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(IDENTITY_REPOSITORY)
    private readonly repository: IdentityRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "请先建立学习会话。",
      });
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      if (!payload.sub || !["anonymous", "registered"].includes(payload.kind)) {
        throw new Error("Invalid access token payload.");
      }

      if (!(await this.repository.isActiveUser(payload.sub))) {
        throw new Error("User is not active.");
      }

      request.user = { id: payload.sub, kind: payload.kind };
      return true;
    } catch {
      throw new UnauthorizedException({
        code: "INVALID_ACCESS_TOKEN",
        message: "登录状态已失效。",
      });
    }
  }

  private extractBearerToken(authorization: string | undefined): string | null {
    const [scheme, token, extra] = authorization?.trim().split(/\s+/) ?? [];
    return scheme === "Bearer" && token && !extra ? token : null;
  }
}
