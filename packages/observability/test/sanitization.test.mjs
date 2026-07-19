import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeDiagnosticMessage, sanitizeHttpPath } from "../dist/index.js";

describe("observability sanitization", () => {
  it("removes URLs, credentials, tokens and private object keys", () => {
    const message = sanitizeDiagnosticMessage(
      new Error(
        "POST https://storage.example/users/u/art.jpg?X-Amz-Signature=secret failed; " +
          "Bearer eyJhbGciOiJIUzI1NiJ9.abcdefghijklmno.signaturevalue " +
          "refresh_token=abc123456789012345678901234567890 password=hunter2 " +
          "redis://worker:redis-secret@redis:6379 users/u/private.jpg",
      ),
    );

    assert.doesNotMatch(
      message,
      /storage\.example|secret|eyJ|abc123|hunter2|worker|private\.jpg/,
    );
    assert.match(message, /redacted/);
  });

  it("removes contact data, controls and bounds output", () => {
    const message = sanitizeDiagnosticMessage(
      "teacher@example.com\n13800138000 " + "safe ".repeat(200),
      80,
    );

    assert.equal(message.length, 80);
    assert.doesNotMatch(message, /teacher|13800138000|\n/);
  });

  it("redacts share bearer paths and drops query strings", () => {
    assert.equal(
      sanitizeHttpPath(
        "/api/v1/shares/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG/summary?debug=secret",
      ),
      "/api/v1/shares/:shareToken/summary",
    );
    assert.equal(
      sanitizeHttpPath("/api/v1/health?token=secret"),
      "/api/v1/health",
    );
  });
});
