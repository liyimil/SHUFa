export interface PracticeRecord {
  attempts: Array<{
    attemptId: string;
    advice: unknown | null;
    analysis: null | {
      failureCode: string | null;
      status: "PENDING" | "READY" | "FAILED";
    };
    artworkId: string;
    createdAt: Date;
    objectKey: string;
    mimeType: string;
    sequence: number;
  }>;
  character: string;
  createdAt: Date;
  id: string;
  master: {
    calligrapherName: string;
    glyphId: string;
    imageObjectKey: string | null;
    workTitle: string;
  };
}

export interface PracticeView {
  attempts: Array<{
    advice: unknown | null;
    analysis: null | {
      failureCode: string | null;
      status: "PENDING" | "READY" | "FAILED";
    };
    artworkId: string;
    createdAt: string;
    imageUrl: string;
    sequence: number;
  }>;
  character: string;
  createdAt: string;
  id: string;
  master: {
    calligrapherName: string;
    glyphId: string;
    imageUrl: string | null;
    workTitle: string;
  };
}

export interface PracticeAnalysisProvenance {
  masterChecksumSha256: string;
  masterObjectKey: string;
  measurementVersion: string;
  modelVersion: string;
  normalizationVersion: string;
  ruleVersion: string;
  userChecksumSha256: string;
  userObjectKey: string;
}

export interface ArtworkDeletionView {
  artworkId: string;
  deletionId: string;
  status: "DELETION_PENDING" | "DELETED" | "FAILED";
  updatedAt: string;
}

export interface FavoriteGlyphView {
  character: string;
  favoriteId: string;
  glyph: PublishedGlyph;
  groupId: string | null;
  sortOrder: number;
}

export interface FavoriteLibraryView {
  groups: Array<{
    id: string;
    items: FavoriteGlyphView[];
    name: string;
    sortOrder: number;
  }>;
  ungrouped: FavoriteGlyphView[];
}
import type { PublishedGlyph } from "../catalog/catalog.types.js";
