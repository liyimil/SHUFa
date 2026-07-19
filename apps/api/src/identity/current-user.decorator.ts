import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthenticatedUser } from "./identity.types.js";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!request.user) {
      throw new Error("CurrentUser requires AuthGuard.");
    }

    return request.user;
  },
);
