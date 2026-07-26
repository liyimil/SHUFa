import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { DatabaseModule } from "../database/database.module.js";
import { AuthGuard } from "./auth.guard.js";
import { ConsoleSmsProvider } from "./console-sms.provider.js";
import { IdentityController } from "./identity.controller.js";
import { IDENTITY_REPOSITORY } from "./identity.repository.js";
import { IdentityService } from "./identity.service.js";
import { PrismaIdentityRepository } from "./prisma-identity.repository.js";
import { SMS_PROVIDER } from "./sms.provider.js";
import { VerificationCodeStore } from "./verification-code.store.js";
import { WebIdentityController } from "./web-identity.controller.js";

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
  controllers: [IdentityController, WebIdentityController],
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
    VerificationCodeStore,
    {
      provide: IDENTITY_REPOSITORY,
      useClass: PrismaIdentityRepository,
    },
    {
      provide: SMS_PROVIDER,
      useClass: ConsoleSmsProvider,
    },
  ],
})
export class IdentityModule {}
