export type AnalysisStatus =
  "PENDING" | "PROCESSING" | "PASSED" | "NEEDS_RETAKE" | "FAILED";

export interface QualityFinding {
  code:
    | "BLURRY"
    | "INK_TOUCHES_BORDER"
    | "LOW_CONTRAST"
    | "RESOLUTION_TOO_LOW"
    | "TOO_BRIGHT"
    | "TOO_DARK";
  message: string;
  severity: "warning" | "error";
}

export interface QualityMetrics {
  blur_score: number;
  brightness: number;
  contrast: number;
  edge_ink_ratio: number;
  height: number;
  ink_coverage: number;
  width: number;
}

export interface QualityResultInput {
  findings: QualityFinding[];
  metrics: QualityMetrics;
  status: "PASS" | "RETAKE";
  threshold_version: string;
}

export interface QualityFailureInput {
  failureCode: "QUALITY_ANALYSIS_FAILED";
  failureMessage: string;
}

export interface ArtworkAnalysisView {
  analysis: null | {
    findings: QualityFinding[];
    metrics: QualityMetrics | null;
    status: AnalysisStatus;
    thresholdVersion: string | null;
  };
  artworkId: string;
  artworkStatus:
    | "PENDING_UPLOAD"
    | "UPLOADED"
    | "PROCESSING"
    | "READY"
    | "FAILED"
    | "DELETION_PENDING"
    | "DELETED";
  confirmedCharacter: string | null;
  createdAt: string;
}
