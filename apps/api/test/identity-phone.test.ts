import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import type { JwtService } from "@nestjs/jwt";

import { ConsoleSmsProvider } from "../src/identity/console-sms.provider.js";
import { IdentityService } from "../src/identity/identity.service.js";
import type { IdentityRepository } from "../src/identity/identity.repository.js";
import type { SmsProvider } from "../src/identity/sms.provider.js";
import {
  VerificationCodeStore,
  hashPhone,
} from "../src/identity/verification-code.store.js";

interface HttpExceptionLike {
  status: number;
  response: { code: string };
}

const mockRepository: IdentityRepository = {
  createAnonymousUserWithSession: () =>
    Promise.resolve({ userId: "anon-user-id" }),
  createRegisteredUserWithSession: () =>
    Promise.resolve({ userId: "new-registered-user-id" }),
  createSessionForUser: () => Promise.resolve(),
  findUserByPhoneHash: () => Promise.resolve(null),
  isActiveUser: () => Promise.resolve(true),
  revokeSession: () => Promise.resolve(),
  rotateSession: () =>
    Promise.resolve({ kind: "anonymous", userId: "anon-user-id" }),
  upgradeAnonymousWithSession: () => Promise.resolve(null),
};

const mockJwtService = {
  signAsync: () => Promise.resolve("mock-access-token"),
} as unknown as JwtService;

describe("IdentityService - Phone Login", () => {
  let service: IdentityService;
  let codeStore: VerificationCodeStore;
  let sentCode: string | null = null;

  beforeEach(() => {
    codeStore = new VerificationCodeStore();
    const smsProvider: SmsProvider = {
      sendVerificationCode: (_phone, code) => {
        sentCode = code;
        return Promise.resolve({ messageId: "test-msg-id", success: true });
      },
    };
    service = new IdentityService(
      mockRepository,
      mockJwtService,
      smsProvider,
      codeStore,
    );
    sentCode = null;
  });

  it("sends a verification code to a valid phone number", async () => {
    const result = await service.sendVerificationCode("13800138000");
    assert.equal(result.sent, true);
    assert.ok(sentCode);
    assert.match(sentCode!, /^\d{6}$/);
  });

  it("rejects an invalid phone number", async () => {
    await assert.rejects(
      () => service.sendVerificationCode("12345678901"),
      (err: HttpExceptionLike) => {
        assert.equal(err.status, 400);
        assert.equal(err.response.code, "INVALID_PHONE_NUMBER");
        return true;
      },
    );
  });

  it("rejects a missing phone number as a client error", async () => {
    await assert.rejects(
      () => service.sendVerificationCode(undefined),
      (err: HttpExceptionLike) => {
        assert.equal(err.status, 400);
        assert.equal(err.response.code, "INVALID_PHONE_NUMBER");
        return true;
      },
    );
  });

  it("invalidates the code when the SMS provider reports delivery failure", async () => {
    let failedCode = "";
    const failingProvider: SmsProvider = {
      sendVerificationCode: (_phone, code) => {
        failedCode = code;
        return Promise.resolve({ messageId: "failed", success: false });
      },
    };
    const svc = new IdentityService(
      mockRepository,
      mockJwtService,
      failingProvider,
      codeStore,
    );

    await assert.rejects(
      () => svc.sendVerificationCode("13800138000"),
      (err: HttpExceptionLike) => {
        assert.equal(err.status, 503);
        assert.equal(err.response.code, "SMS_DELIVERY_FAILED");
        return true;
      },
    );
    await assert.rejects(
      () => svc.verifyPhoneLogin("13800138000", failedCode),
      (err: HttpExceptionLike) => {
        assert.equal(err.response.code, "INVALID_CODE");
        return true;
      },
    );
  });

  it("verifies a valid code and creates a new registered user", async () => {
    await service.sendVerificationCode("13800138000");
    const session = await service.verifyPhoneLogin("13800138000", sentCode!);
    assert.equal(session.user.kind, "registered");
    assert.equal(session.user.id, "new-registered-user-id");
    assert.ok(session.accessToken);
    assert.ok(session.refreshToken);
  });

  it("rejects an invalid verification code", async () => {
    await service.sendVerificationCode("13800138000");
    await assert.rejects(
      () => service.verifyPhoneLogin("13800138000", "000000"),
      (err: HttpExceptionLike) => {
        assert.equal(err.status, 401);
        assert.equal(err.response.code, "INVALID_CODE");
        return true;
      },
    );
  });

  it("locks after too many invalid attempts", async () => {
    await service.sendVerificationCode("13800138000");
    for (let i = 0; i < 5; i++) {
      try {
        await service.verifyPhoneLogin("13800138000", "000000");
      } catch {
        // expected
      }
    }
    await assert.rejects(
      () => service.verifyPhoneLogin("13800138000", sentCode!),
      (err: HttpExceptionLike) => {
        assert.equal(err.status, 400);
        assert.equal(err.response.code, "CODE_LOCKED");
        return true;
      },
    );
  });

  it("upgrades an anonymous user only with a valid refresh-token proof", async () => {
    const anonymousRefreshToken = "a".repeat(43);
    let receivedTokenHash: string | null = null;
    const repo: IdentityRepository = {
      ...mockRepository,
      upgradeAnonymousWithSession: (input) => {
        receivedTokenHash = input.currentRefreshTokenHash;
        return Promise.resolve({ userId: "anon-user-id" });
      },
    };
    const smsProvider: SmsProvider = {
      sendVerificationCode: (_phone, code) => {
        sentCode = code;
        return Promise.resolve({ messageId: "test", success: true });
      },
    };
    const svc = new IdentityService(
      repo,
      mockJwtService,
      smsProvider,
      codeStore,
    );

    await svc.sendVerificationCode("13800138000");
    const session = await svc.verifyPhoneLogin(
      "13800138000",
      sentCode!,
      anonymousRefreshToken,
    );
    assert.equal(session.user.kind, "registered");
    assert.equal(session.user.id, "anon-user-id");
    assert.match(receivedTokenHash!, /^[a-f0-9]{64}$/);
  });

  it("rejects anonymous-account upgrade without a valid refresh-token proof", async () => {
    await service.sendVerificationCode("13800138000");
    await assert.rejects(
      () => service.verifyPhoneLogin("13800138000", sentCode!, "anon-user-id"),
      (err: HttpExceptionLike) => {
        assert.equal(err.status, 401);
        assert.equal(err.response.code, "INVALID_REFRESH_TOKEN");
        return true;
      },
    );
  });

  it("logs in an existing registered user", async () => {
    const existingUser = { id: "existing-user-id", status: "ACTIVE" };
    const repo: IdentityRepository = {
      ...mockRepository,
      findUserByPhoneHash: () => Promise.resolve(existingUser),
    };
    const smsProvider: SmsProvider = {
      sendVerificationCode: (_phone, code) => {
        sentCode = code;
        return Promise.resolve({ messageId: "test", success: true });
      },
    };
    const svc = new IdentityService(
      repo,
      mockJwtService,
      smsProvider,
      codeStore,
    );

    await svc.sendVerificationCode("13800138000");
    const session = await svc.verifyPhoneLogin("13800138000", sentCode!);
    assert.equal(session.user.kind, "registered");
    assert.equal(session.user.id, "existing-user-id");
  });

  it("rejects login for a disabled user", async () => {
    const disabledUser = { id: "disabled-user-id", status: "DISABLED" };
    const repo: IdentityRepository = {
      ...mockRepository,
      findUserByPhoneHash: () => Promise.resolve(disabledUser),
    };
    const smsProvider: SmsProvider = {
      sendVerificationCode: (_phone, code) => {
        sentCode = code;
        return Promise.resolve({ messageId: "test", success: true });
      },
    };
    const svc = new IdentityService(
      repo,
      mockJwtService,
      smsProvider,
      codeStore,
    );

    await svc.sendVerificationCode("13800138000");
    await assert.rejects(
      () => svc.verifyPhoneLogin("13800138000", sentCode!),
      (err: HttpExceptionLike) => {
        assert.equal(err.status, 401);
        assert.equal(err.response.code, "USER_DISABLED");
        return true;
      },
    );
  });
});

describe("ConsoleSmsProvider", () => {
  it("refuses to expose development verification codes in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await assert.rejects(
        () =>
          new ConsoleSmsProvider().sendVerificationCode(
            "13800138000",
            "123456",
            5,
          ),
        (err: HttpExceptionLike) => {
          assert.equal(err.status, 503);
          assert.equal(err.response.code, "SMS_PROVIDER_NOT_CONFIGURED");
          return true;
        },
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});

describe("VerificationCodeStore", () => {
  let store: VerificationCodeStore;

  beforeEach(() => {
    store = new VerificationCodeStore();
  });

  it("generates a 6-digit code", () => {
    const code = store.generateCode();
    assert.match(code, /^\d{6}$/);
  });

  it("stores and verifies a code", () => {
    const phoneHash = hashPhone("13800138000");
    store.storeCode(phoneHash, "123456");
    assert.equal(store.verifyCode(phoneHash, "123456"), "valid");
  });

  it("returns invalid for wrong code", () => {
    const phoneHash = hashPhone("13800138000");
    store.storeCode(phoneHash, "123456");
    assert.equal(store.verifyCode(phoneHash, "654321"), "invalid");
  });

  it("returns invalid for unknown phone", () => {
    const phoneHash = hashPhone("13800138000");
    assert.equal(store.verifyCode(phoneHash, "123456"), "invalid");
  });

  it("locks after max attempts", () => {
    const phoneHash = hashPhone("13800138000");
    store.storeCode(phoneHash, "123456");
    for (let i = 0; i < 5; i++) {
      store.verifyCode(phoneHash, "000000");
    }
    assert.equal(store.verifyCode(phoneHash, "123456"), "locked");
  });

  it("cleans up expired codes", () => {
    const phoneHash = hashPhone("13800138000");
    store.storeCode(phoneHash, "123456");
    // Manually expire the code by modifying the internal store
    const internalStore = (
      store as unknown as { store: Map<string, { expiresAt: Date }> }
    ).store;
    const stored = internalStore.get(phoneHash);
    if (!stored) throw new Error("stored code not found");
    stored.expiresAt = new Date(Date.now() - 1000);
    store.cleanup();
    assert.equal(store.verifyCode(phoneHash, "123456"), "invalid");
  });
});
