import type { Metadata } from "next";

import type { CatalogResult, GlyphDetail } from "./catalog";

function noIndexMetadata(description: string, title: string): Metadata {
  return {
    description,
    robots: { follow: false, index: false },
    title,
  };
}

export function buildCharacterMetadata(
  character: string,
  result: CatalogResult | null,
): Metadata {
  if (!result) {
    return noIndexMetadata(
      "资料服务暂时不可用，请稍后重试。",
      `“${character}”字资料暂时不可用`,
    );
  }
  if (result.glyphs.length === 0) {
    return noIndexMetadata(
      `“${character}”字尚未收录经过来源与版权审核的名家写法。`,
      `“${character}”字尚未收录可靠范字`,
    );
  }
  const title = `${character}字的历代名家写法`;
  const description = `查看“${character}”字经过审核、来源可追溯的历代名家写法。`;
  const glyphWithImage = result.glyphs.find((glyph) => glyph.image);
  const images = glyphWithImage?.image
    ? [
        {
          alt: `${glyphWithImage.calligrapher.name}书${character}字`,
          height: glyphWithImage.image.height,
          url: glyphWithImage.image.url,
          width: glyphWithImage.image.width,
        },
      ]
    : undefined;
  return {
    description,
    openGraph: { description, images, title, type: "website" },
    title,
    twitter: {
      card: images ? "summary_large_image" : "summary",
      description,
      images,
      title,
    },
  };
}

export function buildGlyphMetadata(glyph: GlyphDetail | null): Metadata {
  if (!glyph) {
    return noIndexMetadata(
      "范字可能已下架、权利已到期，或资料服务暂时不可用。",
      "范字详情不可用",
    );
  }
  const title = `${glyph.calligrapher.name}书“${glyph.character}”字｜${glyph.work.title}`;
  const description = `${glyph.calligrapher.dynasty}代${glyph.calligrapher.name}《${glyph.work.title}》中的“${glyph.character}”字，版本、来源与原帖位置可追溯。`;
  const images = glyph.image
    ? [
        {
          alt: `${glyph.calligrapher.name}书${glyph.character}字`,
          height: glyph.image.height,
          url: glyph.image.url,
          width: glyph.image.width,
        },
      ]
    : undefined;
  return {
    description,
    openGraph: { description, images, title, type: "article" },
    title,
    twitter: {
      card: images ? "summary_large_image" : "summary",
      description,
      images,
      title,
    },
  };
}

export function buildCharacterJsonLd(result: CatalogResult) {
  const character = result.canonicalCharacter ?? result.query;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: result.glyphs.map((glyph, index) => ({
        "@type": "ListItem",
        item: {
          "@type": "VisualArtwork",
          creator: {
            "@type": "Person",
            name: glyph.calligrapher.name,
          },
          creditText: glyph.rights.attributionText ?? glyph.rights.sourceName,
          image: glyph.image?.url,
          isPartOf: {
            "@type": "CreativeWork",
            name: glyph.work.title,
          },
          name: `${glyph.calligrapher.name}书“${character}”字`,
          provider: {
            "@type": "Organization",
            name: glyph.rights.sourceName,
          },
        },
        position: index + 1,
      })),
      numberOfItems: result.glyphs.length,
    },
    name: `“${character}”字的名家写法`,
  };
}

export function buildGlyphJsonLd(glyph: GlyphDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    creator: {
      "@type": "Person",
      name: glyph.calligrapher.name,
    },
    creditText: glyph.rights.attributionText ?? glyph.rights.sourceName,
    image: glyph.image?.url,
    isBasedOn: glyph.edition.sourceUrl ?? undefined,
    isPartOf: {
      "@type": "CreativeWork",
      name: glyph.work.title,
    },
    name: `${glyph.calligrapher.name}书“${glyph.character}”字`,
    provider: {
      "@type": "Organization",
      name: glyph.rights.sourceName,
      sameAs: glyph.rights.sourceUrl ?? undefined,
    },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
