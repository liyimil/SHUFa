import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildShareApiUrl, buildShareSummaryApiUrl } from "../lib/share";
import {
  buildShareCardSummary,
  publicWebOrigin,
  shareOpenGraphImageUrl,
} from "../lib/share-card";

describe("share URL", () => {
  it("encodes opaque share tokens", () => {
    assert.equal(
      buildShareApiUrl("https://api.example/", "opaque_token"),
      "https://api.example/api/v1/shares/opaque_token",
    );
    assert.equal(
      buildShareSummaryApiUrl("https://api.example/", "opaque_token"),
      "https://api.example/api/v1/shares/opaque_token/summary",
    );
  });

  it("builds public Open Graph URLs from an explicit Web origin", () => {
    assert.equal(
      publicWebOrigin("https://www.example.com/path"),
      "https://www.example.com",
    );
    assert.equal(
      shareOpenGraphImageUrl("https://www.example.com/", "opaque/token"),
      "https://www.example.com/shares/opaque%2Ftoken/opengraph-image",
    );
  });

  it("keeps user artwork URLs and identifiers out of the share card summary", () => {
    const summary = buildShareCardSummary({
      attemptCount: 1,
      character: "永",
      master: {
        calligrapherName: "欧阳询",
        workTitle: "九成宫醴泉铭",
      },
    });

    assert.deepEqual(summary, {
      active: true,
      attemptCount: 1,
      description: "临写欧阳询《九成宫醴泉铭》，共1次练习。",
      title: "“永”字书法练习记录",
    });
    assert.doesNotMatch(
      JSON.stringify(summary),
      /secret|artwork|practice-id|imageUrl/,
    );
  });

  it("uses a non-sensitive fallback after revocation", () => {
    assert.deepEqual(buildShareCardSummary(null), {
      active: false,
      attemptCount: 0,
      description: "该分享已过期、被撤销或不存在。",
      title: "书法练习分享不可用",
    });
  });
});
