import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BadRequestException, NotFoundException } from "@nestjs/common";

import type { CatalogRepository } from "../src/catalog/catalog.repository.js";
import type { CatalogFilters } from "../src/catalog/catalog.types.js";
import { CatalogService } from "../src/catalog/catalog.service.js";

class RecordingCatalogRepository implements CatalogRepository {
  lastCharacter: string | null = null;
  lastFilters: CatalogFilters | null = null;

  findPublishedGlyphsByCharacter(character: string, filters: CatalogFilters) {
    this.lastCharacter = character;
    this.lastFilters = filters;
    return Promise.resolve({
      canonicalCharacter: character,
      facets: { calligraphers: [], scriptStyles: [], works: [] },
      filters,
      glyphs: [],
      query: character,
    });
  }

  findPublishedGlyphById() {
    return Promise.resolve(null);
  }
}

describe("CatalogService", () => {
  it("normalizes and accepts exactly one Han character", async () => {
    const repository = new RecordingCatalogRepository();
    const service = new CatalogService(repository);

    const result = await service.findPublishedGlyphs("  永  ");

    assert.equal(repository.lastCharacter, "永");
    assert.deepEqual(result, {
      canonicalCharacter: "永",
      facets: { calligraphers: [], scriptStyles: [], works: [] },
      filters: {},
      glyphs: [],
      query: "永",
    });
  });

  it("validates and passes structured catalog filters", async () => {
    const repository = new RecordingCatalogRepository();
    const service = new CatalogService(repository);
    const calligrapherId = "3fe537fd-6601-43f0-a31d-781bd5bde945";
    const workId = "53a3e68c-c38c-4b79-90b4-ab1212491184";

    await service.findPublishedGlyphs("永", {
      calligrapherId,
      scriptStyle: "REGULAR",
      workId,
    });

    assert.deepEqual(repository.lastFilters, {
      calligrapherId,
      scriptStyle: "REGULAR",
      workId,
    });
    await assert.rejects(
      () => service.findPublishedGlyphs("永", { calligrapherId: "not-uuid" }),
      BadRequestException,
    );
  });

  it("rejects multiple characters", async () => {
    const service = new CatalogService(new RecordingCatalogRepository());

    await assert.rejects(
      () => service.findPublishedGlyphs("永字"),
      BadRequestException,
    );
  });

  it("rejects non-Han input", async () => {
    const service = new CatalogService(new RecordingCatalogRepository());

    await assert.rejects(
      () => service.findPublishedGlyphs("A"),
      BadRequestException,
    );
  });

  it("does not expose missing or unpublished glyph details", async () => {
    const service = new CatalogService(new RecordingCatalogRepository());
    await assert.rejects(
      () =>
        service.findPublishedGlyphDetail(
          "3fe537fd-6601-43f0-a31d-781bd5bde945",
        ),
      NotFoundException,
    );
  });
});
