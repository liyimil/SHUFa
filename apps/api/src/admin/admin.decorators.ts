import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from "@nestjs/common";

import { ADMIN_ROLES_KEY } from "./admin-auth.guard.js";
import type { AdminPrincipal, AdminRole } from "./admin-auth.types.js";

export const RequireAdminRoles = (...roles: AdminRole[]) =>
  SetMetadata(ADMIN_ROLES_KEY, roles);

export const CurrentStaff = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<{ staff: AdminPrincipal }>();
    return request.staff;
  },
);
