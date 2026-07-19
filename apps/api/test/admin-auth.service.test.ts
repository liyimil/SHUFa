import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { JwtService } from "@nestjs/jwt";

import { AdminAuthService } from "../src/admin/admin-auth.service.js";

describe("AdminAuthService", () => {
  const previousAccounts = process.env.ADMIN_ACCOUNTS_JSON;

  before(() => {
    const salt = "test-salt";
    const digest = scryptSync("correct-password", salt, 64).toString(
      "base64url",
    );
    process.env.ADMIN_ACCOUNTS_JSON = JSON.stringify([
      {
        email: "editor@example.com",
        passwordHash: `scrypt$${salt}$${digest}`,
        roles: ["EDITOR"],
      },
    ]);
  });

  after(() => {
    if (previousAccounts === undefined) {
      delete process.env.ADMIN_ACCOUNTS_JSON;
    } else {
      process.env.ADMIN_ACCOUNTS_JSON = previousAccounts;
    }
  });

  it("creates a role-scoped staff token for valid credentials", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const service = new AdminAuthService(jwt);
    const result = await service.createSession(
      " EDITOR@example.com ",
      "correct-password",
    );
    const payload = await jwt.verifyAsync<{
      kind: string;
      roles: string[];
      sub: string;
    }>(result.accessToken);

    assert.equal(payload.kind, "staff");
    assert.equal(payload.sub, "editor@example.com");
    assert.deepEqual(payload.roles, ["EDITOR"]);
  });

  it("rejects an invalid password", async () => {
    const service = new AdminAuthService(
      new JwtService({ secret: "test-secret" }),
    );
    await assert.rejects(() =>
      service.createSession("editor@example.com", "wrong-password"),
    );
  });
});
