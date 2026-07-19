import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestPublicCatalogInvalidation } from "../src/admin/public-catalog-invalidator.js";

describe("public catalog cache invalidation boundary", () => {
  it("sends the shared token only to the configured Web endpoint", async () => {
    let authorization = "";
    let method = "";
    let url = "";
    const sent = await requestPublicCatalogInvalidation(
      {
        WEB_CACHE_INVALIDATION_TOKEN: "secret-token".repeat(4),
        WEB_CACHE_INVALIDATION_URL:
          "https://web.internal/api/internal/catalog-cache",
      },
      async (input, init) => {
        url = String(input);
        method = init?.method ?? "";
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(null, { status: 200 });
      },
    );
    assert.equal(sent, true);
    assert.equal(url, "https://web.internal/api/internal/catalog-cache");
    assert.equal(method, "POST");
    assert.equal(authorization, `Bearer ${"secret-token".repeat(4)}`);
  });

  it("is disabled when local development has no invalidation configuration", async () => {
    const sent = await requestPublicCatalogInvalidation({}, () => {
      throw new Error("fetch should not be called");
    });
    assert.equal(sent, false);
  });

  it("reports a failed Web invalidation so the operation can be retried", async () => {
    await assert.rejects(
      () =>
        requestPublicCatalogInvalidation(
          {
            WEB_CACHE_INVALIDATION_TOKEN: "secret-token".repeat(4),
            WEB_CACHE_INVALIDATION_URL:
              "https://web.internal/api/internal/catalog-cache",
          },
          () => Promise.resolve(new Response(null, { status: 503 })),
        ),
      /invalidation failed \(503\)/,
    );
  });
});
