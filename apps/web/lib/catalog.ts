import { readApiClientError, type operations } from "@calligraphy/api-contract";

import { publicCatalogCacheTag } from "./catalog-cache";

type ContractCatalogResult =
  operations["CatalogController_findGlyphs"]["responses"][200]["content"]["application/json"];
type ContractGlyphDetail =
  operations["GlyphController_getDetail"]["responses"][200]["content"]["application/json"];

export interface CatalogGlyph {
  authenticityGrade:
    "A_ORIGINAL" | "B_RUBBING_OR_AUTHORIZED_EDITION" | "C_MODERN_COPY";
  calligrapher: { dynasty: string; id: string; name: string };
  edition: {
    holdingInstitution: string | null;
    id: string;
    name: string;
    sourceUrl: string | null;
  };
  id: string;
  image: {
    height: number;
    id: string;
    kind: string;
    url: string;
    width: number;
  } | null;
  rights: {
    attributionText: string | null;
    licenseName: string | null;
    sourceName: string;
    sourceUrl: string | null;
  };
  work: { id: string; title: string };
}

export interface CatalogResult {
  canonicalCharacter: string | null;
  facets: {
    calligraphers: Array<{ dynasty: string; id: string; name: string }>;
    scriptStyles: Array<"REGULAR">;
    works: Array<{ calligrapherId: string; id: string; title: string }>;
  };
  filters: CatalogFilters;
  glyphs: CatalogGlyph[];
  query: string;
}

export interface CatalogFilters {
  calligrapherId?: string;
  scriptStyle?: "REGULAR";
  workId?: string;
}

export interface GlyphDetail extends CatalogGlyph {
  character: string;
  publishedAt: string;
  sourceContext: {
    boundingBox: { height: number; width: number; x: number; y: number };
    pageLabel: string | null;
    sourceImage: { height: number; width: number };
  };
}

const singleHanCharacterPattern = /^\p{Script=Han}$/u;

export function normalizeHanQuery(rawQuery: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawQuery);
  } catch {
    return null;
  }
  const character = decoded.trim().normalize("NFC");
  return singleHanCharacterPattern.test(character) ? character : null;
}

export function buildCatalogUrl(
  apiOrigin: string,
  character: string,
  filters: CatalogFilters = {},
): string {
  const origin = apiOrigin.replace(/\/$/, "");
  const url = new URL(
    `${origin}/api/v1/characters/${encodeURIComponent(character)}/glyphs`,
  );
  for (const [key, value] of Object.entries(filters)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function buildGlyphDetailUrl(
  apiOrigin: string,
  glyphId: string,
): string {
  const origin = apiOrigin.replace(/\/$/, "");
  return `${origin}/api/v1/glyphs/${encodeURIComponent(glyphId)}`;
}

export async function fetchCatalog(
  character: string,
  filters: CatalogFilters = {},
): Promise<CatalogResult> {
  const apiOrigin = process.env.API_BASE_URL ?? "http://localhost:3001";
  const response = await fetch(buildCatalogUrl(apiOrigin, character, filters), {
    next: { revalidate: 300, tags: [publicCatalogCacheTag] },
  });

  if (!response.ok) {
    throw await readApiClientError(response, "范字目录请求失败");
  }

  const payload = (await response.json()) as ContractCatalogResult;
  return payload;
}

export async function fetchGlyphDetail(
  glyphId: string,
): Promise<GlyphDetail | null> {
  const apiOrigin = process.env.API_BASE_URL ?? "http://localhost:3001";
  const response = await fetch(buildGlyphDetailUrl(apiOrigin, glyphId), {
    next: { revalidate: 300, tags: [publicCatalogCacheTag] },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw await readApiClientError(response, "范字详情请求失败");
  }
  const payload = (await response.json()) as ContractGlyphDetail;
  return payload;
}
