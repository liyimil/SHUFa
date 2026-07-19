import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { DatabaseModule } from "../database/database.module.js";
import { AuthGuard } from "./auth.guard.js";
import { IdentityController } from "./identity.controller.js";
import { IDENTITY_REPOSITORY } from "./identity.repository.js";
import { IdentityService } from "./identity.service.js";
import { PrismaIdentityRepository } from "./prisma-identity.repository.js";

const localJwtSecret = "local-development-jwt-secret-change-before-production";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production.");
  }
  return localJwtSecret;
}

@Module({
  controllers: [IdentityController],
  exports: [AuthGuard, IdentityService, JwtModule, IDENTITY_REPOSITORY],
  imports: [
    DatabaseModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { issuer: "calligraphy-learning-api" },
      verifyOptions: { issuer: "calligraphy-learning-api" },
    }),
  ],
  providers: [
    AuthGuard,
    IdentityService,
    {
      provide: IDENTITY_REPOSITORY,
      useClass: PrismaIdentityRepository,
    },
  ],
})
export class IdentityModule {}
