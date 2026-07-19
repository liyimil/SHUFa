export interface GlyphImage {
  height: number;
  id: string;
  kind: "GLYPH_CROP" | "THUMBNAIL";
  url: string;
  width: number;
}

export interface PublishedGlyph {
  authenticityGrade:
    "A_ORIGINAL" | "B_RUBBING_OR_AUTHORIZED_EDITION" | "C_MODERN_COPY";
  beginnerWeight: number;
  calligrapher: {
    dynasty: string;
    id: string;
    name: string;
  };
  edition: {
    holdingInstitution: string | null;
    id: string;
    name: string;
    sourceUrl: string | null;
  };
  id: string;
  image: GlyphImage | null;
  imageQuality: number;
  rights: {
    attributionText: string | null;
    licenseName: string | null;
    sourceName: string;
    sourceUrl: string | null;
  };
  scriptStyle: "REGULAR";
  work: {
    id: string;
    title: string;
  };
}

export interface CatalogFilters {
  calligrapherId?: string;
  scriptStyle?: "REGULAR";
  workId?: string;
}

export interface CatalogFacets {
  calligraphers: Array<{ dynasty: string; id: string; name: string }>;
  scriptStyles: Array<"REGULAR">;
  works: Array<{ calligrapherId: string; id: string; title: string }>;
}

export interface PublishedGlyphDetail extends PublishedGlyph {
  character: string;
  publishedAt: string;
  sourceContext: {
    boundingBox: { height: number; width: number; x: number; y: number };
    pageLabel: string | null;
    sourceImage: { height: number; width: number };
  };
}

export interface CharacterGlyphResult {
  canonicalCharacter: string | null;
  facets: CatalogFacets;
  filters: CatalogFilters;
  glyphs: PublishedGlyph[];
  query: string;
}
