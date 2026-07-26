import { Injectable } from "@nestjs/common";
import { createHmac, randomInt } from "node:crypto";

interface StoredCode {
  code: string;
  expiresAt: Date;
  attempts: number;
}

const MAX_ATTEMPTS = 5;
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function hashPhone(phone: string): string {
  const pepper =
    process.env.PHONE_HASH_PEPPER ?? "local-development-phone-hash-pepper";
  return createHmac("sha256", pepper).update(phone.trim()).digest("hex");
}

@Injectable()
export class VerificationCodeStore {
  private readonly store = new Map<string, StoredCode>();

  generateCode(): string {
    return randomInt(100_000, 999_999).toString();
  }

  storeCode(phoneHash: string, code: string): void {
    this.store.set(phoneHash, {
      code,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      attempts: 0,
    });
  }

  deleteCode(phoneHash: string): void {
    this.store.delete(phoneHash);
  }

  verifyCode(
    phoneHash: string,
    code: string,
  ): "valid" | "expired" | "invalid" | "locked" {
    const stored = this.store.get(phoneHash);
    if (!stored) return "invalid";

    if (stored.attempts >= MAX_ATTEMPTS) {
      this.store.delete(phoneHash);
      return "locked";
    }

    if (stored.expiresAt < new Date()) {
      this.store.delete(phoneHash);
      return "expired";
    }

    stored.attempts += 1;

    if (stored.code !== code) {
      return "invalid";
    }

    this.store.delete(phoneHash);
    return "valid";
  }

  cleanup(): void {
    const now = new Date();
    for (const [key, value] of this.store.entries()) {
      if (value.expiresAt < now) {
        this.store.delete(key);
      }
    }
  }
}
