import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apiRequestIdHint,
  readApiClientError,
} from "@calligraphy/api-contract";

import {
  buildCatalogUrl,
  buildGlyphDetailUrl,
  normalizeHanQuery,
} from "../lib/catalog";
import {
  hasValidBearerToken,
  publicCatalogCacheTag,
} from "../lib/catalog-cache";

describe("catalog query helpers", () => {
  it("normalizes exactly one Han character", () => {
    assert.equal(normalizeHanQuery("  永  "), "永");
    assert.equal(normalizeHanQuery("%E6%B0%B8"), "永");
    assert.equal(normalizeHanQuery("永字"), null);
    assert.equal(normalizeHanQuery("A"), null);
    assert.equal(normalizeHanQuery("%E6%B0"), null);
  });

  it("builds an encoded API URL", () => {
    assert.equal(
      buildCatalogUrl("http://localhost:3001/", "永"),
      "http://localhost:3001/api/v1/characters/%E6%B0%B8/glyphs",
    );
    assert.equal(
      buildCatalogUrl("https://api.example.com", "永", {
        scriptStyle: "REGULAR",
        workId: "work-id",
      }),
      "https://api.example.com/api/v1/characters/%E6%B0%B8/glyphs?scriptStyle=REGULAR&workId=work-id",
    );
    assert.equal(
      buildGlyphDetailUrl("https://api.example.com/", "glyph/id"),
      "https://api.example.com/api/v1/glyphs/glyph%2Fid",
    );
  });

  it("protects the global public catalog invalidation tag", () => {
    const token = "a".repeat(32);
    assert.equal(publicCatalogCacheTag, "public-catalog-v1");
    assert.equal(hasValidBearerToken(`Bearer ${token}`, token), true);
    assert.equal(hasValidBearerToken("Bearer wrong", token), false);
    assert.equal(hasValidBearerToken(`Basic ${token}`, token), false);
  });

  it("exposes only validated request ids on public error pages", async () => {
    const safe = await readApiClientError(
      Response.json(
        { message: "内部服务失败。" },
        { headers: { "X-Request-Id": "web-request-789" }, status: 503 },
      ),
    );
    assert.equal(apiRequestIdHint(safe), "追踪 ID：web-request-789");

    const unsafe = await readApiClientError(
      Response.json(
        { message: "内部服务失败。" },
        { headers: { "X-Request-Id": "not/a/safe/id" }, status: 503 },
      ),
    );
    assert.equal(apiRequestIdHint(unsafe), null);
    assert.doesNotMatch(unsafe.message, /not\/a\/safe\/id/);
  });
});
