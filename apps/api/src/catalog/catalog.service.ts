import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from "./catalog.repository.js";
import type {
  CatalogFilters,
  CharacterGlyphResult,
  PublishedGlyphDetail,
} from "./catalog.types.js";

const singleHanCharacterPattern = /^\p{Script=Han}$/u;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CatalogService {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly repository: CatalogRepository,
  ) {}

  async findPublishedGlyphs(
    rawCharacter: string,
    rawFilters: Record<string, unknown> = {},
  ): Promise<CharacterGlyphResult> {
    const character = rawCharacter.trim().normalize("NFC");

    if (!singleHanCharacterPattern.test(character)) {
      throw new BadRequestException({
        code: "INVALID_CHARACTER_QUERY",
        message: "请输入一个汉字。",
      });
    }

    return this.repository.findPublishedGlyphsByCharacter(
      character,
      this.validateFilters(rawFilters),
    );
  }

  async findPublishedGlyphDetail(
    rawGlyphId: string,
  ): Promise<PublishedGlyphDetail> {
    if (!uuidPattern.test(rawGlyphId)) {
      throw new BadRequestException({ code: "INVALID_GLYPH_ID" });
    }
    const detail = await this.repository.findPublishedGlyphById(rawGlyphId);
    if (!detail) {
      throw new NotFoundException({ code: "GLYPH_NOT_FOUND" });
    }
    return detail;
  }

  private validateFilters(raw: Record<string, unknown>): CatalogFilters {
    const filters: CatalogFilters = {};
    for (const key of ["calligrapherId", "workId"] as const) {
      if (raw[key] !== undefined && raw[key] !== "") {
        if (typeof raw[key] !== "string" || !uuidPattern.test(raw[key])) {
          throw new BadRequestException({ code: "INVALID_CATALOG_FILTER" });
        }
        filters[key] = raw[key];
      }
    }
    if (raw.scriptStyle !== undefined && raw.scriptStyle !== "") {
      if (raw.scriptStyle !== "REGULAR") {
        throw new BadRequestException({ code: "INVALID_CATALOG_FILTER" });
      }
      filters.scriptStyle = "REGULAR";
    }
    return filters;
  }
}
