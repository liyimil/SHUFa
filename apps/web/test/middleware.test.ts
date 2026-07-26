import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { NextRequest } from "next/server";

import { middleware } from "../middleware.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("web session middleware", () => {
  it("forwards a newly created session on the first request", async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        Response.json({
          accessToken: "first-request-access-token",
          expiresInSeconds: 900,
          refreshExpiresInSeconds: 2_592_000,
          refreshToken: "r".repeat(43),
          tokenType: "Bearer",
          user: { id: "user-1", kind: "anonymous" },
        }),
      );

    const response = await middleware(
      new NextRequest("http://localhost:3000/app"),
    );

    assert.equal(
      response.headers.get("x-middleware-request-x-session-access-token"),
      "first-request-access-token",
    );
    const accessCookie = response.cookies.get("calligraphy_at");
    assert.equal(accessCookie?.httpOnly, true);
  });

  it("removes unusable cookies after an unauthorized refresh", async () => {
    globalThis.fetch = () =>
      Promise.resolve(Response.json({}, { status: 401 }));
    const request = new NextRequest("http://localhost:3000/app", {
      headers: { cookie: `calligraphy_rt=${"r".repeat(43)}` },
    });

    const response = await middleware(request);

    assert.equal(response.cookies.get("calligraphy_rt")?.value, "");
    assert.equal(response.cookies.get("calligraphy_at")?.value, "");
  });
});
