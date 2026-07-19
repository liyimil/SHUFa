import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CatalogResult, GlyphDetail } from "../lib/catalog";
import {
  buildCharacterJsonLd,
  buildCharacterMetadata,
  buildGlyphJsonLd,
  buildGlyphMetadata,
  serializeJsonLd,
} from "../lib/public-page-metadata";

const glyph: GlyphDetail = {
  authenticityGrade: "B_RUBBING_OR_AUTHORIZED_EDITION",
  calligrapher: { dynasty: "唐", id: "calligrapher-id", name: "欧阳询" },
  character: "永",
  edition: {
    holdingInstitution: "示例收藏机构",
    id: "edition-id",
    name: "核验版本",
    sourceUrl: "https://source.example/edition",
  },
  id: "glyph-id",
  image: {
    height: 500,
    id: "public-image-id",
    kind: "GLYPH_CROP",
    url: "https://public.example/glyph.webp",
    width: 500,
  },
  publishedAt: "2026-07-18T00:00:00.000Z",
  rights: {
    attributionText: "示例来源署名",
    licenseName: "授权公开展示",
    sourceName: "示例权利来源",
    sourceUrl: "https://source.example/rights",
  },
  sourceContext: {
    boundingBox: { height: 500, width: 500, x: 100, y: 200 },
    pageLabel: "第 3 页",
    sourceImage: { height: 3000, width: 2000 },
  },
  work: { id: "work-id", title: "九成宫醴泉铭" },
};

const catalog: CatalogResult = {
  canonicalCharacter: "永",
  facets: { calligraphers: [], scriptStyles: ["REGULAR"], works: [] },
  filters: {},
  glyphs: [glyph],
  query: "永",
};

describe("public page metadata", () => {
  it("uses only a currently public catalog crop in character social metadata", () => {
    const metadata = buildCharacterMetadata("永", catalog);
    const serialized = JSON.stringify(metadata);

    assert.match(serialized, /https:\/\/public\.example\/glyph\.webp/);
    assert.match(serialized, /欧阳询书永字/);
    assert.doesNotMatch(serialized, /sourceImage|boundingBox|glyph-id/);
  });

  it("does not index or invent an image for an empty catalog", () => {
    const metadata = buildCharacterMetadata("永", {
      ...catalog,
      glyphs: [],
    });

    assert.deepEqual(metadata.robots, { follow: false, index: false });
    assert.equal(metadata.openGraph, undefined);
  });

  it("builds traceable glyph metadata and schema without internal IDs", () => {
    const metadata = JSON.stringify(buildGlyphMetadata(glyph));
    const structured = serializeJsonLd(buildGlyphJsonLd(glyph));

    assert.match(metadata, /欧阳询书/);
    assert.match(metadata, /https:\/\/public\.example\/glyph\.webp/);
    assert.match(structured, /VisualArtwork/);
    assert.match(structured, /示例权利来源/);
    assert.doesNotMatch(structured, /glyph-id|edition-id|sourceImage/);
  });

  it("escapes markup when serializing public JSON-LD", () => {
    const structured = serializeJsonLd({
      name: "</script><script>alert(1)</script>",
      page: buildCharacterJsonLd(catalog),
    });

    assert.doesNotMatch(structured, /<\/script>/);
    assert.match(structured, /\\u003c\/script>/);
  });
});
