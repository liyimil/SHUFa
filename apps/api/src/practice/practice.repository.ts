import type {
  ArtworkDeletionView,
  FavoriteLibraryView,
  PracticeAnalysisProvenance,
  PracticeRecord,
} from "./practice.types.js";

export const PRACTICE_REPOSITORY = Symbol("PRACTICE_REPOSITORY");

export interface PracticeRepository {
  addAttempt(
    userId: string,
    sessionId: string,
    artworkId: string,
  ): Promise<PracticeRecord | null>;
  createFavorite(
    userId: string,
    glyphId: string,
    groupId: string | null | undefined,
    now: Date,
  ): Promise<boolean>;
  createFavoriteGroup(
    userId: string,
    name: string,
  ): Promise<{ id: string; name: string; sortOrder: number } | null>;
  createPractice(
    userId: string,
    artworkId: string,
    glyphId: string,
  ): Promise<PracticeRecord | null>;
  createShare(
    userId: string,
    sessionId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<{ id: string } | null>;
  completeArtworkDeletion(input: {
    attemptNumber: number;
    deletionId: string;
    now: Date;
    objectKey: string;
  }): Promise<boolean>;
  failArtworkDeletion(input: {
    attemptNumber: number;
    deletionId: string;
    failureCode: string;
    failureMessage: string;
    now: Date;
    objectKey: string;
  }): Promise<boolean>;
  findOwnedArtworkDeletion(
    userId: string,
    deletionId: string,
  ): Promise<ArtworkDeletionView | null>;
  findOwnedPractice(
    userId: string,
    sessionId: string,
  ): Promise<PracticeRecord | null>;
  findPublicShare(tokenHash: string, now: Date): Promise<PracticeRecord | null>;
  listFavorites(userId: string, now: Date): Promise<FavoriteLibraryView>;
  listPractices(userId: string): Promise<PracticeRecord[]>;
  requestArtworkDeletion(
    userId: string,
    artworkId: string,
    now: Date,
  ): Promise<null | {
    artworkId: string;
    attemptNumber: number;
    deletionId: string;
    objectKey: string;
    status: "PENDING" | "COMPLETED";
    updatedAt: Date;
  }>;
  prepareAnalysisRun(input: {
    attemptId: string;
    masterObjectKey: string;
    userObjectKey: string;
  }): Promise<void>;
  recordAnalysisFailure(input: {
    attemptId: string;
    failureCode: string;
    failureMessage: string;
    masterObjectKey: string;
    userObjectKey: string;
  }): Promise<boolean>;
  removeFavorite(userId: string, glyphId: string): Promise<void>;
  removeFavoriteGroup(userId: string, groupId: string): Promise<boolean>;
  reorderFavorite(
    userId: string,
    glyphId: string,
    direction: "UP" | "DOWN",
  ): Promise<boolean>;
  reorderFavoriteGroup(
    userId: string,
    groupId: string,
    direction: "UP" | "DOWN",
  ): Promise<boolean>;
  revokeShare(userId: string, shareId: string, now: Date): Promise<boolean>;
  updateFavoriteGroup(
    userId: string,
    groupId: string,
    name: string,
  ): Promise<boolean>;
  recordAdvice(
    attemptId: string,
    advice: Record<string, unknown>,
    provenance: PracticeAnalysisProvenance,
    now: Date,
  ): Promise<boolean>;
}
