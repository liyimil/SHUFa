import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { CatalogRepository } from "./catalog.repository.js";
import type {
  CatalogFacets,
  CatalogFilters,
  CharacterGlyphResult,
  GlyphImage,
  PublishedGlyph,
  PublishedGlyphDetail,
} from "./catalog.types.js";

const localPublicAssetBaseUrl = "http://localhost:9000/calligraphy-public";

export const catalogGlyphSelect = {
  assets: {
    where: { kind: { in: ["GLYPH_CROP", "THUMBNAIL"] } },
    orderBy: { kind: "asc" },
    select: {
      height: true,
      id: true,
      kind: true,
      objectKey: true,
      width: true,
    },
  },
  authenticityGrade: true,
  bboxHeight: true,
  bboxWidth: true,
  bboxX: true,
  bboxY: true,
  beginnerWeight: true,
  character: { select: { value: true } },
  id: true,
  imageQuality: true,
  publishedAt: true,
  scriptStyle: true,
  sourceAsset: {
    select: {
      height: true,
      pageLabel: true,
      width: true,
      edition: {
        select: {
          holdingInstitution: true,
          id: true,
          name: true,
          sourceUrl: true,
          work: {
            select: {
              calligrapher: {
                select: { dynasty: true, id: true, name: true },
              },
              id: true,
              title: true,
            },
          },
        },
      },
      rightsRecord: {
        select: {
          attributionText: true,
          licenseName: true,
          maxPublicWidth: true,
          sourceName: true,
          sourceUrl: true,
        },
      },
    },
  },
} satisfies Prisma.GlyphSelect;

export type CatalogGlyphRecord = Prisma.GlyphGetPayload<{
  select: typeof catalogGlyphSelect;
}>;

function toPublicAssetUrl(objectKey: string): string {
  const baseUrl = (
    process.env.PUBLIC_ASSET_BASE_URL ?? localPublicAssetBaseUrl
  ).replace(/\/$/, "");
  const encodedPath = objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/${encodedPath}`;
}

export function publishedGlyphWhere(
  now: Date,
  characterId?: string,
  filters: CatalogFilters = {},
): Prisma.GlyphWhereInput {
  const edition: Prisma.WorkEditionWhereInput = {};
  if (filters.workId) edition.workId = filters.workId;
  if (filters.calligrapherId) {
    edition.work = { calligrapherId: filters.calligrapherId };
  }
  return {
    authenticityGrade: { not: "D_AI_GENERATED" },
    ...(characterId ? { characterId } : {}),
    contentStatus: "PUBLISHED",
    ...(filters.scriptStyle ? { scriptStyle: filters.scriptStyle } : {}),
    sourceAsset: {
      edition: {
        AND: [
          edition,
          {
            isActive: true,
            work: {
              isActive: true,
              calligrapher: { isActive: true },
            },
          },
        ],
      },
      rightsRecord: {
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        ],
        status: "CLEARED_PUBLIC",
      },
    },
  };
}

@Injectable()
export class PrismaCatalogRepository implements CatalogRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findPublishedGlyphsByCharacter(
    character: string,
    filters: CatalogFilters,
  ): Promise<CharacterGlyphResult> {
    const foundCharacter = await this.prisma.character.findFirst({
      select: { id: true, value: true },
      where: {
        OR: [
          { value: character },
          { variants: { some: { value: character } } },
        ],
      },
    });
    if (!foundCharacter) {
      return {
        canonicalCharacter: null,
        facets: { calligraphers: [], scriptStyles: [], works: [] },
        filters,
        glyphs: [],
        query: character,
      };
    }

    const now = new Date();
    const [glyphs, facetRows] = await this.prisma.$transaction([
      this.prisma.glyph.findMany({
        orderBy: [
          { beginnerWeight: "desc" },
          { imageQuality: "desc" },
          { id: "asc" },
        ],
        select: catalogGlyphSelect,
        where: publishedGlyphWhere(now, foundCharacter.id, filters),
      }),
      this.prisma.glyph.findMany({
        select: {
          scriptStyle: true,
          sourceAsset: {
            select: {
              edition: {
                select: {
                  work: {
                    select: {
                      calligrapher: {
                        select: { dynasty: true, id: true, name: true },
                      },
                      id: true,
                      title: true,
                    },
                  },
                },
              },
            },
          },
        },
        where: publishedGlyphWhere(now, foundCharacter.id),
      }),
    ]);

    return {
      canonicalCharacter: foundCharacter.value,
      facets: this.buildFacets(facetRows),
      filters,
      glyphs: glyphs.map(mapPublishedGlyph),
      query: character,
    };
  }

  async findPublishedGlyphById(
    glyphId: string,
  ): Promise<PublishedGlyphDetail | null> {
    const glyph = await this.prisma.glyph.findFirst({
      select: catalogGlyphSelect,
      where: { ...publishedGlyphWhere(new Date()), id: glyphId },
    });
    if (!glyph?.publishedAt) return null;
    return {
      ...mapPublishedGlyph(glyph),
      character: glyph.character.value,
      publishedAt: glyph.publishedAt.toISOString(),
      sourceContext: {
        boundingBox: {
          height: glyph.bboxHeight,
          width: glyph.bboxWidth,
          x: glyph.bboxX,
          y: glyph.bboxY,
        },
        pageLabel: glyph.sourceAsset.pageLabel,
        sourceImage: {
          height: glyph.sourceAsset.height,
          width: glyph.sourceAsset.width,
        },
      },
    };
  }

  private buildFacets(
    rows: Array<{
      scriptStyle: "REGULAR";
      sourceAsset: {
        edition: {
          work: {
            calligrapher: { dynasty: string; id: string; name: string };
            id: string;
            title: string;
          };
        };
      };
    }>,
  ): CatalogFacets {
    const calligraphers = new Map<
      string,
      { dynasty: string; id: string; name: string }
    >();
    const works = new Map<
      string,
      { calligrapherId: string; id: string; title: string }
    >();
    const scriptStyles = new Set<"REGULAR">();
    for (const row of rows) {
      const work = row.sourceAsset.edition.work;
      calligraphers.set(work.calligrapher.id, work.calligrapher);
      works.set(work.id, {
        calligrapherId: work.calligrapher.id,
        id: work.id,
        title: work.title,
      });
      scriptStyles.add(row.scriptStyle);
    }
    return {
      calligraphers: [...calligraphers.values()].sort((a, b) =>
        a.name.localeCompare(b.name, "zh-CN"),
      ),
      scriptStyles: [...scriptStyles],
      works: [...works.values()].sort((a, b) =>
        a.title.localeCompare(b.title, "zh-CN"),
      ),
    };
  }
}

export function mapPublishedGlyph(glyph: CatalogGlyphRecord): PublishedGlyph {
  const candidateAsset = glyph.assets[0];
  const maximumWidth = glyph.sourceAsset.rightsRecord.maxPublicWidth;
  const asset =
    candidateAsset &&
    (maximumWidth === null || candidateAsset.width <= maximumWidth)
      ? candidateAsset
      : undefined;
  const assetKind = asset?.kind;
  if (glyph.authenticityGrade === "D_AI_GENERATED") {
    throw new Error(
      "AI-generated glyphs must never be mapped as published master works.",
    );
  }
  if (assetKind && assetKind !== "GLYPH_CROP" && assetKind !== "THUMBNAIL") {
    throw new Error(
      "Only public glyph crops or thumbnails can be returned by the catalog.",
    );
  }
  const image: GlyphImage | null = asset
    ? {
        height: asset.height,
        id: asset.id,
        kind: assetKind ?? "THUMBNAIL",
        url: toPublicAssetUrl(asset.objectKey),
        width: asset.width,
      }
    : null;
  return {
    authenticityGrade: glyph.authenticityGrade,
    beginnerWeight: glyph.beginnerWeight,
    calligrapher: glyph.sourceAsset.edition.work.calligrapher,
    edition: {
      holdingInstitution: glyph.sourceAsset.edition.holdingInstitution,
      id: glyph.sourceAsset.edition.id,
      name: glyph.sourceAsset.edition.name,
      sourceUrl: glyph.sourceAsset.edition.sourceUrl,
    },
    id: glyph.id,
    image,
    imageQuality: glyph.imageQuality,
    rights: {
      attributionText: glyph.sourceAsset.rightsRecord.attributionText,
      licenseName: glyph.sourceAsset.rightsRecord.licenseName,
      sourceName: glyph.sourceAsset.rightsRecord.sourceName,
      sourceUrl: glyph.sourceAsset.rightsRecord.sourceUrl,
    },
    scriptStyle: glyph.scriptStyle,
    work: {
      id: glyph.sourceAsset.edition.work.id,
      title: glyph.sourceAsset.edition.work.title,
    },
  };
}
