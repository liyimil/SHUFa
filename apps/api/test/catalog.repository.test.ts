import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrismaService } from "../src/database/prisma.service.js";
import { PrismaCatalogRepository } from "../src/catalog/prisma-catalog.repository.js";

const glyphRecord = {
  assets: [
    {
      height: 500,
      id: "asset-id",
      kind: "GLYPH_CROP",
      objectKey: "public/glyph.webp",
      width: 500,
    },
  ],
  authenticityGrade: "B_RUBBING_OR_AUTHORIZED_EDITION",
  bboxHeight: 500,
  bboxWidth: 500,
  bboxX: 120,
  bboxY: 240,
  beginnerWeight: 80,
  character: { value: "永" },
  id: "3fe537fd-6601-43f0-a31d-781bd5bde945",
  imageQuality: 90,
  publishedAt: new Date("2026-07-18T00:00:00.000Z"),
  scriptStyle: "REGULAR",
  sourceAsset: {
    height: 3000,
    objectKey: "private/source-original.jpg",
    pageLabel: "第 3 页",
    width: 2000,
    edition: {
      holdingInstitution: "示例收藏机构",
      id: "edition-id",
      name: "核验版本",
      sourceUrl: "https://source.example/edition",
      work: {
        calligrapher: { dynasty: "唐", id: "calligrapher-id", name: "书家" },
        id: "work-id",
        title: "碑帖",
      },
    },
    rightsRecord: {
      attributionText: "来源署名",
      licenseName: "授权展示",
      maxPublicWidth: 300,
      sourceName: "权利来源",
      sourceUrl: "https://source.example/rights",
    },
  },
};

describe("PrismaCatalogRepository", () => {
  it("never exposes a crop wider than the rights limit or the private source key", async () => {
    let capturedWhere: unknown = null;
    const prisma = {
      glyph: {
        findFirst: (input: { where: unknown }) => {
          capturedWhere = input.where;
          return Promise.resolve(glyphRecord);
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaCatalogRepository(prisma);

    const detail = await repository.findPublishedGlyphById(
      "3fe537fd-6601-43f0-a31d-781bd5bde945",
    );

    assert.equal(detail?.image, null);
    assert.equal(detail?.sourceContext.pageLabel, "第 3 页");
    assert.equal(
      JSON.stringify(detail).includes("private/source-original"),
      false,
    );
    assert.match(JSON.stringify(capturedWhere), /validFrom/);
    assert.match(JSON.stringify(capturedWhere), /validUntil/);
    assert.match(JSON.stringify(capturedWhere), /isActive/);
    assert.match(JSON.stringify(capturedWhere), /calligrapher/);
  });
});
