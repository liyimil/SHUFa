import type {
  AnalysisStatus,
  ArtworkAnalysisView,
  QualityFailureInput,
  QualityResultInput,
} from "./analysis.types.js";

export const ANALYSIS_REPOSITORY = Symbol("ANALYSIS_REPOSITORY");

export interface AnalysisRepository {
  confirmCharacter(
    artworkId: string,
    userId: string,
    character: string,
    unicodeCodePoint: string,
  ): Promise<{ character: string } | null>;
  findOwnedArtwork(
    artworkId: string,
    userId: string,
  ): Promise<ArtworkAnalysisView | null>;
  recordFailure(
    analysisId: string,
    input: QualityFailureInput,
    now: Date,
  ): Promise<{ artworkId: string; status: AnalysisStatus } | null>;
  recordResult(
    analysisId: string,
    input: QualityResultInput,
    now: Date,
  ): Promise<{ artworkId: string; status: AnalysisStatus } | null>;
}
