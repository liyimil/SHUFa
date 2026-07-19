import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

import type {
  AdminAccessTokenPayload,
  AdminPrincipal,
  AdminRole,
} from "./admin-auth.types.js";

export const ADMIN_ROLES_KEY = "admin-roles";

interface AdminRequest {
  headers: { authorization?: string };
  staff?: AdminPrincipal;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const [scheme, token, extra] =
      request.headers.authorization?.trim().split(/\s+/) ?? [];
    if (scheme !== "Bearer" || !token || extra) {
      throw new UnauthorizedException({
        code: "ADMIN_AUTH_REQUIRED",
        message: "请先登录内容后台。",
      });
    }
    let payload: AdminAccessTokenPayload;
    try {
      payload =
        await this.jwtService.verifyAsync<AdminAccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException({
        code: "INVALID_ADMIN_TOKEN",
        message: "后台登录状态已失效。",
      });
    }
    if (
      payload.kind !== "staff" ||
      !payload.sub ||
      !Array.isArray(payload.roles)
    ) {
      throw new UnauthorizedException({
        code: "INVALID_ADMIN_TOKEN",
        message: "后台登录状态无效。",
      });
    }

    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      requiredRoles?.length &&
      !payload.roles.includes("ADMIN") &&
      !requiredRoles.some((role) => payload.roles.includes(role))
    ) {
      throw new ForbiddenException({
        code: "ADMIN_ROLE_REQUIRED",
        message: "当前账号没有执行此操作的权限。",
      });
    }
    request.staff = { email: payload.sub, roles: payload.roles };
    return true;
  }
}
