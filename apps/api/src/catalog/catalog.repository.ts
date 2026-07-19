import type {
  CatalogFilters,
  CharacterGlyphResult,
  PublishedGlyphDetail,
} from "./catalog.types.js";

export const CATALOG_REPOSITORY = Symbol("CATALOG_REPOSITORY");

export interface CatalogRepository {
  findPublishedGlyphsByCharacter(
    character: string,
    filters: CatalogFilters,
  ): Promise<CharacterGlyphResult>;
  findPublishedGlyphById(glyphId: string): Promise<PublishedGlyphDetail | null>;
}
