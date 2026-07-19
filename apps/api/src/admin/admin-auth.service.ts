import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import {
  adminRoles,
  type AdminAccessTokenPayload,
  type AdminRole,
} from "./admin-auth.types.js";

const scrypt = promisify(scryptCallback);
const tokenTtlSeconds = 8 * 60 * 60;

interface ConfiguredAccount {
  email: string;
  passwordHash: string;
  roles: AdminRole[];
}

function readAccounts(): ConfiguredAccount[] {
  const raw = process.env.ADMIN_ACCOUNTS_JSON;
  if (!raw) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ADMIN_ACCOUNTS_JSON must be valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("ADMIN_ACCOUNTS_JSON must be an array.");
  }
  return parsed.map((account: unknown) => {
    const value = account as Record<string, unknown>;
    const roles = Array.isArray(value.roles) ? value.roles.map(String) : [];
    if (
      typeof value.email !== "string" ||
      typeof value.passwordHash !== "string" ||
      roles.length === 0 ||
      roles.some((role) => !adminRoles.includes(role as AdminRole))
    ) {
      throw new Error("ADMIN_ACCOUNTS_JSON contains an invalid account.");
    }
    return {
      email: value.email.trim().toLowerCase(),
      passwordHash: value.passwordHash,
      roles: roles as AdminRole[],
    };
  });
}

async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, salt, digest] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !digest) {
    return false;
  }
  const expected = Buffer.from(digest, "base64url");
  if (expected.byteLength !== 64) {
    return false;
  }
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(expected, actual);
}

@Injectable()
export class AdminAuthService {
  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {}

  async createSession(rawEmail: unknown, rawPassword: unknown) {
    const email =
      typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    const password = typeof rawPassword === "string" ? rawPassword : "";
    const account = readAccounts().find(
      (candidate) => candidate.email === email,
    );
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      throw new UnauthorizedException({
        code: "INVALID_ADMIN_CREDENTIALS",
        message: "后台账号或密码不正确。",
      });
    }
    const payload: AdminAccessTokenPayload = {
      kind: "staff",
      roles: account.roles,
      sub: account.email,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload, {
        expiresIn: tokenTtlSeconds,
      }),
      expiresInSeconds: tokenTtlSeconds,
      staff: { email: account.email, roles: account.roles },
      tokenType: "Bearer",
    };
  }
}
