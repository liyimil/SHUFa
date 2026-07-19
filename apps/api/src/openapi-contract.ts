import type { OpenAPIObject } from "@nestjs/swagger";

type SchemaObject = NonNullable<
  NonNullable<OpenAPIObject["components"]>["schemas"]
>[string];

type JsonOperation = {
  "x-client-contract"?: boolean;
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
};

const jsonContent = (schemaName: string) => ({
  content: {
    "application/json": {
      schema: { $ref: `#/components/schemas/${schemaName}` },
    },
  },
});

const schemas: Record<string, SchemaObject> = {
  ArtworkDeletionView: {
    properties: {
      artworkId: { format: "uuid", type: "string" },
      deletionId: { format: "uuid", type: "string" },
      status: {
        enum: ["DELETION_PENDING", "DELETED", "FAILED"],
        type: "string",
      },
      updatedAt: { format: "date-time", type: "string" },
    },
    required: ["artworkId", "deletionId", "status", "updatedAt"],
    type: "object",
  },
  ArtworkAnalysis: {
    properties: {
      findings: {
        items: { $ref: "#/components/schemas/QualityFinding" },
        type: "array",
      },
      metrics: {
        allOf: [{ $ref: "#/components/schemas/QualityMetrics" }],
        nullable: true,
      },
      status: {
        enum: ["PENDING", "PROCESSING", "PASSED", "NEEDS_RETAKE", "FAILED"],
        type: "string",
      },
      thresholdVersion: { nullable: true, type: "string" },
    },
    required: ["findings", "metrics", "status", "thresholdVersion"],
    type: "object",
  },
  ArtworkAnalysisView: {
    properties: {
      analysis: {
        allOf: [{ $ref: "#/components/schemas/ArtworkAnalysis" }],
        nullable: true,
      },
      artworkId: { format: "uuid", type: "string" },
      artworkStatus: {
        enum: [
          "PENDING_UPLOAD",
          "UPLOADED",
          "PROCESSING",
          "READY",
          "FAILED",
          "DELETION_PENDING",
          "DELETED",
        ],
        type: "string",
      },
      confirmedCharacter: { nullable: true, type: "string" },
      createdAt: { format: "date-time", type: "string" },
    },
    required: [
      "analysis",
      "artworkId",
      "artworkStatus",
      "confirmedCharacter",
      "createdAt",
    ],
    type: "object",
  },
  CancelUploadResult: {
    properties: {
      artworkId: { format: "uuid", type: "string" },
      status: { enum: ["DELETED"], type: "string" },
      uploadId: { format: "uuid", type: "string" },
    },
    required: ["artworkId", "status", "uploadId"],
    type: "object",
  },
  CreateFavoriteGroupRequest: {
    properties: { name: { maxLength: 40, minLength: 1, type: "string" } },
    required: ["name"],
    type: "object",
  },
  CreatePracticeRequest: {
    properties: {
      artworkId: { format: "uuid", type: "string" },
      glyphId: { format: "uuid", type: "string" },
    },
    required: ["artworkId", "glyphId"],
    type: "object",
  },
  CatalogFilters: {
    properties: {
      calligrapherId: { format: "uuid", type: "string" },
      scriptStyle: { enum: ["REGULAR"], type: "string" },
      workId: { format: "uuid", type: "string" },
    },
    type: "object",
  },
  CatalogGlyphResult: {
    properties: {
      canonicalCharacter: { nullable: true, type: "string" },
      facets: { $ref: "#/components/schemas/CatalogFacets" },
      filters: { $ref: "#/components/schemas/CatalogFilters" },
      glyphs: {
        items: { $ref: "#/components/schemas/PublishedGlyph" },
        type: "array",
      },
      query: { type: "string" },
    },
    required: ["canonicalCharacter", "facets", "filters", "glyphs", "query"],
    type: "object",
  },
  CatalogFacets: {
    properties: {
      calligraphers: {
        items: { $ref: "#/components/schemas/CalligrapherSummary" },
        type: "array",
      },
      scriptStyles: {
        items: { enum: ["REGULAR"], type: "string" },
        type: "array",
      },
      works: {
        items: { $ref: "#/components/schemas/WorkSummary" },
        type: "array",
      },
    },
    required: ["calligraphers", "scriptStyles", "works"],
    type: "object",
  },
  CalligrapherSummary: {
    properties: {
      dynasty: { type: "string" },
      id: { format: "uuid", type: "string" },
      name: { type: "string" },
    },
    required: ["dynasty", "id", "name"],
    type: "object",
  },
  CharacterConfirmationRequest: {
    properties: { character: { minLength: 1, type: "string" } },
    required: ["character"],
    type: "object",
  },
  CharacterConfirmationResult: {
    properties: { character: { type: "string" } },
    required: ["character"],
    type: "object",
  },
  CompleteUploadResult: {
    properties: {
      analysisId: { format: "uuid", type: "string" },
      artworkId: { format: "uuid", type: "string" },
      status: { enum: ["PROCESSING"], type: "string" },
      uploadedAt: { format: "date-time", type: "string" },
    },
    required: ["analysisId", "artworkId", "status", "uploadedAt"],
    type: "object",
  },
  CreateUploadRequest: {
    properties: {
      clientRequestId: { maxLength: 100, minLength: 16, type: "string" },
      height: { maximum: 12000, minimum: 256, type: "integer" },
      mimeType: {
        enum: ["image/jpeg", "image/png", "image/webp"],
        type: "string",
      },
      sizeBytes: { maximum: 10485760, minimum: 1, type: "integer" },
      width: { maximum: 12000, minimum: 256, type: "integer" },
    },
    required: ["clientRequestId", "height", "mimeType", "sizeBytes", "width"],
    type: "object",
  },
  CreateUploadResult: {
    properties: {
      artworkId: { format: "uuid", type: "string" },
      expiresAt: { format: "date-time", type: "string" },
      requiredHeaders: {
        properties: {
          "content-type": {
            enum: ["image/jpeg", "image/png", "image/webp"],
            type: "string",
          },
        },
        required: ["content-type"],
        type: "object",
      },
      uploadId: { format: "uuid", type: "string" },
      uploadUrl: { format: "uri", type: "string" },
    },
    required: [
      "artworkId",
      "expiresAt",
      "requiredHeaders",
      "uploadId",
      "uploadUrl",
    ],
    type: "object",
  },
  DeleteFavoriteGroupResult: {
    properties: {
      deleted: { type: "boolean" },
      id: { format: "uuid", type: "string" },
    },
    required: ["deleted", "id"],
    type: "object",
  },
  FavoriteGlyphItem: {
    properties: {
      character: { type: "string" },
      favoriteId: { format: "uuid", type: "string" },
      glyph: { $ref: "#/components/schemas/PublishedGlyph" },
      groupId: { format: "uuid", nullable: true, type: "string" },
      sortOrder: { minimum: 0, type: "integer" },
    },
    required: ["character", "favoriteId", "glyph", "groupId", "sortOrder"],
    type: "object",
  },
  FavoriteGroup: {
    properties: {
      id: { format: "uuid", type: "string" },
      items: {
        items: { $ref: "#/components/schemas/FavoriteGlyphItem" },
        type: "array",
      },
      name: { type: "string" },
      sortOrder: { minimum: 0, type: "integer" },
    },
    required: ["id", "items", "name", "sortOrder"],
    type: "object",
  },
  FavoriteGroupResult: {
    properties: {
      id: { format: "uuid", type: "string" },
      name: { type: "string" },
      sortOrder: { minimum: 0, type: "integer" },
    },
    required: ["id", "name", "sortOrder"],
    type: "object",
  },
  FavoriteLibrary: {
    properties: {
      groups: {
        items: { $ref: "#/components/schemas/FavoriteGroup" },
        type: "array",
      },
      ungrouped: {
        items: { $ref: "#/components/schemas/FavoriteGlyphItem" },
        type: "array",
      },
    },
    required: ["groups", "ungrouped"],
    type: "object",
  },
  FavoritePlacementRequest: {
    properties: {
      groupId: { format: "uuid", nullable: true, type: "string" },
    },
    type: "object",
  },
  FavoriteStateResult: {
    properties: {
      favorite: { type: "boolean" },
      glyphId: { format: "uuid", type: "string" },
    },
    required: ["favorite", "glyphId"],
    type: "object",
  },
  FeedbackSubmitRequest: {
    properties: {
      accurate: { type: "boolean" },
      kind: {
        enum: [
          "STRUCTURE_ADVICE",
          "RECOGNITION_ERROR",
          "QUALITY_RESULT",
          "CONTENT_ERROR",
          "PRODUCT",
        ],
        type: "string",
      },
      message: { maxLength: 2000, type: "string" },
      referenceId: { format: "uuid", type: "string" },
      referenceType: {
        enum: ["Artwork", "Glyph", "PracticeSession"],
        type: "string",
      },
    },
    required: ["kind"],
    type: "object",
  },
  FeedbackCreatedResult: {
    properties: {
      id: { format: "uuid", type: "string" },
      status: {
        enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"],
        type: "string",
      },
    },
    required: ["id", "status"],
    type: "object",
  },
  HealthResult: {
    properties: {
      service: { enum: ["api"], type: "string" },
      status: { enum: ["ok"], type: "string" },
      timestamp: { format: "date-time", type: "string" },
    },
    required: ["service", "status", "timestamp"],
    type: "object",
  },
  GlyphDetail: {
    allOf: [
      { $ref: "#/components/schemas/PublishedGlyph" },
      {
        properties: {
          character: { type: "string" },
          publishedAt: { format: "date-time", type: "string" },
          sourceContext: { $ref: "#/components/schemas/SourceContext" },
        },
        required: ["character", "publishedAt", "sourceContext"],
        type: "object",
      },
    ],
  },
  GlyphImage: {
    properties: {
      height: { minimum: 1, type: "integer" },
      id: { format: "uuid", type: "string" },
      kind: { enum: ["GLYPH_CROP", "THUMBNAIL"], type: "string" },
      url: { format: "uri", type: "string" },
      width: { minimum: 1, type: "integer" },
    },
    required: ["height", "id", "kind", "url", "width"],
    type: "object",
  },
  IdentitySession: {
    properties: {
      accessToken: { type: "string" },
      expiresInSeconds: { minimum: 1, type: "integer" },
      refreshExpiresInSeconds: { minimum: 1, type: "integer" },
      refreshToken: { type: "string" },
      tokenType: { enum: ["Bearer"], type: "string" },
      user: { $ref: "#/components/schemas/SessionUser" },
    },
    required: [
      "accessToken",
      "expiresInSeconds",
      "refreshExpiresInSeconds",
      "refreshToken",
      "tokenType",
      "user",
    ],
    type: "object",
  },
  PublishedGlyph: {
    properties: {
      authenticityGrade: {
        enum: [
          "A_ORIGINAL",
          "B_RUBBING_OR_AUTHORIZED_EDITION",
          "C_MODERN_COPY",
        ],
        type: "string",
      },
      beginnerWeight: { type: "number" },
      calligrapher: { $ref: "#/components/schemas/CalligrapherSummary" },
      edition: { $ref: "#/components/schemas/PublishedEdition" },
      id: { format: "uuid", type: "string" },
      image: {
        allOf: [{ $ref: "#/components/schemas/GlyphImage" }],
        nullable: true,
      },
      imageQuality: { type: "number" },
      rights: { $ref: "#/components/schemas/PublishedRights" },
      scriptStyle: { enum: ["REGULAR"], type: "string" },
      work: { $ref: "#/components/schemas/PublishedWork" },
    },
    required: [
      "authenticityGrade",
      "beginnerWeight",
      "calligrapher",
      "edition",
      "id",
      "image",
      "imageQuality",
      "rights",
      "scriptStyle",
      "work",
    ],
    type: "object",
  },
  PublishedEdition: {
    properties: {
      holdingInstitution: { nullable: true, type: "string" },
      id: { format: "uuid", type: "string" },
      name: { type: "string" },
      sourceUrl: { format: "uri", nullable: true, type: "string" },
    },
    required: ["holdingInstitution", "id", "name", "sourceUrl"],
    type: "object",
  },
  PublishedRights: {
    properties: {
      attributionText: { nullable: true, type: "string" },
      licenseName: { nullable: true, type: "string" },
      sourceName: { type: "string" },
      sourceUrl: { format: "uri", nullable: true, type: "string" },
    },
    required: ["attributionText", "licenseName", "sourceName", "sourceUrl"],
    type: "object",
  },
  PublishedWork: {
    properties: {
      id: { format: "uuid", type: "string" },
      title: { type: "string" },
    },
    required: ["id", "title"],
    type: "object",
  },
  PrivacyPreferences: {
    properties: {
      allowArtworkStorage: { type: "boolean" },
      allowModelTraining: { type: "boolean" },
      allowPublicSharing: { type: "boolean" },
      policyVersion: { type: "string" },
      sharingUpdatedAt: { format: "date-time", type: "string" },
      storageUpdatedAt: { format: "date-time", type: "string" },
      trainingUpdatedAt: { format: "date-time", type: "string" },
      updatedAt: { format: "date-time", type: "string" },
    },
    required: [
      "allowArtworkStorage",
      "allowModelTraining",
      "allowPublicSharing",
      "policyVersion",
      "sharingUpdatedAt",
      "storageUpdatedAt",
      "trainingUpdatedAt",
      "updatedAt",
    ],
    type: "object",
  },
  PrivacyPreferencesUpdate: {
    minProperties: 1,
    properties: {
      allowArtworkStorage: { type: "boolean" },
      allowModelTraining: { type: "boolean" },
      allowPublicSharing: { type: "boolean" },
    },
    type: "object",
  },
  PracticeAdvice: {
    additionalProperties: true,
    properties: {
      advanced_analysis_status: {
        enum: ["UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE"],
        type: "string",
      },
      master: { $ref: "#/components/schemas/StructureMetrics" },
      measurement_version: {
        enum: ["structure-measurement-v2"],
        type: "string",
      },
      model_version: { enum: ["no-ml-geometry-v1"], type: "string" },
      normalization_version: {
        enum: ["glyph-normalization-v1"],
        type: "string",
      },
      status: { enum: ["OK", "LOW_CONFIDENCE"], type: "string" },
      suggestions: {
        items: { $ref: "#/components/schemas/StructureSuggestion" },
        maxItems: 3,
        type: "array",
      },
      threshold_version: { enum: ["structure-v1"], type: "string" },
      user: { $ref: "#/components/schemas/StructureMetrics" },
    },
    required: [
      "advanced_analysis_status",
      "master",
      "measurement_version",
      "model_version",
      "normalization_version",
      "status",
      "suggestions",
      "threshold_version",
      "user",
    ],
    type: "object",
  },
  PracticeAnalysisState: {
    properties: {
      failureCode: { nullable: true, type: "string" },
      status: { enum: ["PENDING", "READY", "FAILED"], type: "string" },
    },
    required: ["failureCode", "status"],
    type: "object",
  },
  PracticeAttempt: {
    properties: {
      advice: {
        allOf: [{ $ref: "#/components/schemas/PracticeAdvice" }],
        nullable: true,
      },
      analysis: {
        allOf: [{ $ref: "#/components/schemas/PracticeAnalysisState" }],
        nullable: true,
      },
      artworkId: { format: "uuid", type: "string" },
      createdAt: { format: "date-time", type: "string" },
      imageUrl: { format: "uri", type: "string" },
      sequence: { minimum: 1, type: "integer" },
    },
    required: [
      "advice",
      "analysis",
      "artworkId",
      "createdAt",
      "imageUrl",
      "sequence",
    ],
    type: "object",
  },
  PracticeAttemptRequest: {
    properties: { artworkId: { format: "uuid", type: "string" } },
    required: ["artworkId"],
    type: "object",
  },
  PracticeMaster: {
    properties: {
      calligrapherName: { type: "string" },
      glyphId: { format: "uuid", type: "string" },
      imageUrl: { format: "uri", nullable: true, type: "string" },
      workTitle: { type: "string" },
    },
    required: ["calligrapherName", "glyphId", "imageUrl", "workTitle"],
    type: "object",
  },
  PracticeView: {
    properties: {
      attempts: {
        items: { $ref: "#/components/schemas/PracticeAttempt" },
        type: "array",
      },
      character: { type: "string" },
      createdAt: { format: "date-time", type: "string" },
      id: { format: "uuid", type: "string" },
      master: { $ref: "#/components/schemas/PracticeMaster" },
    },
    required: ["attempts", "character", "createdAt", "id", "master"],
    type: "object",
  },
  ProductEventRequest: {
    properties: {
      eventId: { format: "uuid", type: "string" },
      name: {
        enum: [
          "ARTWORK_UPLOAD_COMPLETED",
          "CHARACTER_CONFIRMED",
          "CATALOG_RESULTS_VIEWED",
          "GLYPH_SELECTED",
          "PRACTICE_CREATED",
          "ADVICE_VIEWED",
          "SECOND_ATTEMPT_STARTED",
          "PRACTICE_COMPLETED",
        ],
        type: "string",
      },
      occurredAt: { format: "date-time", type: "string" },
      practiceSessionId: { format: "uuid", nullable: true, type: "string" },
    },
    required: ["eventId", "name", "occurredAt"],
    type: "object",
  },
  ProductEventResult: {
    properties: {
      eventId: { format: "uuid", type: "string" },
      status: { enum: ["RECORDED", "DUPLICATE"], type: "string" },
    },
    required: ["eventId", "status"],
    type: "object",
  },
  QualityFinding: {
    properties: {
      code: {
        enum: [
          "BLURRY",
          "INK_TOUCHES_BORDER",
          "LOW_CONTRAST",
          "RESOLUTION_TOO_LOW",
          "TOO_BRIGHT",
          "TOO_DARK",
        ],
        type: "string",
      },
      message: { type: "string" },
      severity: { enum: ["warning", "error"], type: "string" },
    },
    required: ["code", "message", "severity"],
    type: "object",
  },
  QualityMetrics: {
    properties: {
      blur_score: { minimum: 0, type: "number" },
      brightness: { maximum: 255, minimum: 0, type: "number" },
      contrast: { minimum: 0, type: "number" },
      edge_ink_ratio: { maximum: 1, minimum: 0, type: "number" },
      height: { minimum: 1, type: "integer" },
      ink_coverage: { maximum: 1, minimum: 0, type: "number" },
      width: { minimum: 1, type: "integer" },
    },
    required: [
      "blur_score",
      "brightness",
      "contrast",
      "edge_ink_ratio",
      "height",
      "ink_coverage",
      "width",
    ],
    type: "object",
  },
  ReorderRequest: {
    properties: { direction: { enum: ["UP", "DOWN"], type: "string" } },
    required: ["direction"],
    type: "object",
  },
  ReorderResult: {
    properties: {
      glyphId: { format: "uuid", type: "string" },
      groupId: { format: "uuid", type: "string" },
      reordered: { type: "boolean" },
    },
    required: ["reordered"],
    type: "object",
  },
  RefreshTokenRequest: {
    properties: { refreshToken: { minLength: 1, type: "string" } },
    required: ["refreshToken"],
    type: "object",
  },
  RevokeSessionResult: {
    properties: { revoked: { type: "boolean" } },
    required: ["revoked"],
    type: "object",
  },
  RevokeShareResult: {
    properties: {
      revoked: { type: "boolean" },
      shareId: { format: "uuid", type: "string" },
    },
    required: ["revoked", "shareId"],
    type: "object",
  },
  ShareResult: {
    properties: {
      expiresAt: { format: "date-time", type: "string" },
      id: { format: "uuid", type: "string" },
      url: { format: "uri", type: "string" },
    },
    required: ["expiresAt", "id", "url"],
    type: "object",
  },
  ShareSummary: {
    properties: {
      attemptCount: { minimum: 0, type: "integer" },
      character: { type: "string" },
      master: {
        properties: {
          calligrapherName: { type: "string" },
          workTitle: { type: "string" },
        },
        required: ["calligrapherName", "workTitle"],
        type: "object",
      },
    },
    required: ["attemptCount", "character", "master"],
    type: "object",
  },
  StructureMetrics: {
    properties: {
      anomalies: {
        items: {
          enum: [
            "NO_FOREGROUND",
            "TOO_SPARSE",
            "TOO_DENSE",
            "TOUCHES_EDGE",
            "FRAGMENTED_FOREGROUND",
          ],
          type: "string",
        },
        maxItems: 5,
        type: "array",
      },
      bbox_height_ratio: { maximum: 1, minimum: 0, type: "number" },
      bbox_left_ratio: { maximum: 1, minimum: 0, type: "number" },
      bbox_top_ratio: { maximum: 1, minimum: 0, type: "number" },
      bbox_width_ratio: { maximum: 1, minimum: 0, type: "number" },
      centroid_x: { maximum: 1, minimum: 0, type: "number" },
      centroid_y: { maximum: 1, minimum: 0, type: "number" },
      confidence: { maximum: 1, minimum: 0, type: "number" },
      foreground_ratio: { maximum: 1, minimum: 0, type: "number" },
      ink_aspect_ratio: { exclusiveMinimum: true, minimum: 0, type: "number" },
      normalization: {
        properties: {
          canvas_height: { enum: [512], type: "integer" },
          canvas_width: { enum: [512], type: "integer" },
          offset_x: { minimum: 0, type: "integer" },
          offset_y: { minimum: 0, type: "integer" },
          scale: { exclusiveMinimum: true, minimum: 0, type: "number" },
          source_height: { minimum: 1, type: "integer" },
          source_width: { minimum: 1, type: "integer" },
          version: { enum: ["glyph-normalization-v1"], type: "string" },
        },
        required: [
          "canvas_height",
          "canvas_width",
          "offset_x",
          "offset_y",
          "scale",
          "source_height",
          "source_width",
          "version",
        ],
        type: "object",
      },
      spatial_distribution: {
        properties: {
          bottom_left: { maximum: 1, minimum: 0, type: "number" },
          bottom_right: { maximum: 1, minimum: 0, type: "number" },
          top_left: { maximum: 1, minimum: 0, type: "number" },
          top_right: { maximum: 1, minimum: 0, type: "number" },
        },
        required: ["bottom_left", "bottom_right", "top_left", "top_right"],
        type: "object",
      },
    },
    required: [
      "anomalies",
      "bbox_height_ratio",
      "bbox_left_ratio",
      "bbox_top_ratio",
      "bbox_width_ratio",
      "centroid_x",
      "centroid_y",
      "confidence",
      "foreground_ratio",
      "ink_aspect_ratio",
      "normalization",
      "spatial_distribution",
    ],
    type: "object",
  },
  StructureSuggestion: {
    properties: {
      action: { maxLength: 500, type: "string" },
      code: { enum: ["CENTER_X", "CENTER_Y", "PROPORTION"], type: "string" },
      evidence: { maxLength: 500, type: "string" },
      phenomenon: { maxLength: 500, type: "string" },
    },
    required: ["action", "code", "evidence", "phenomenon"],
    type: "object",
  },
  UpdateFavoriteGroupRequest: {
    properties: { name: { maxLength: 40, minLength: 1, type: "string" } },
    required: ["name"],
    type: "object",
  },
  UpdateFavoriteGroupResult: {
    properties: {
      id: { format: "uuid", type: "string" },
      name: { type: "string" },
    },
    required: ["id", "name"],
    type: "object",
  },
  UserFeedbackTicket: {
    properties: {
      accurate: { nullable: true, type: "boolean" },
      createdAt: { format: "date-time", type: "string" },
      id: { format: "uuid", type: "string" },
      kind: {
        enum: [
          "STRUCTURE_ADVICE",
          "RECOGNITION_ERROR",
          "QUALITY_RESULT",
          "CONTENT_ERROR",
          "PRODUCT",
        ],
        type: "string",
      },
      message: { nullable: true, type: "string" },
      referenceId: { format: "uuid", nullable: true, type: "string" },
      referenceType: { nullable: true, type: "string" },
      resolutionNote: { nullable: true, type: "string" },
      resolvedAt: { format: "date-time", nullable: true, type: "string" },
      status: {
        enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"],
        type: "string",
      },
      updatedAt: { format: "date-time", type: "string" },
    },
    required: [
      "accurate",
      "createdAt",
      "id",
      "kind",
      "message",
      "referenceId",
      "referenceType",
      "resolutionNote",
      "resolvedAt",
      "status",
      "updatedAt",
    ],
    type: "object",
  },
  SessionUser: {
    properties: {
      id: { format: "uuid", type: "string" },
      kind: { enum: ["anonymous", "registered"], type: "string" },
    },
    required: ["id", "kind"],
    type: "object",
  },
  SourceContext: {
    properties: {
      boundingBox: { $ref: "#/components/schemas/SourceRectangle" },
      pageLabel: { nullable: true, type: "string" },
      sourceImage: { $ref: "#/components/schemas/SourceImageSize" },
    },
    required: ["boundingBox", "pageLabel", "sourceImage"],
    type: "object",
  },
  SourceImageSize: {
    properties: {
      height: { minimum: 1, type: "integer" },
      width: { minimum: 1, type: "integer" },
    },
    required: ["height", "width"],
    type: "object",
  },
  SourceRectangle: {
    properties: {
      height: { minimum: 1, type: "integer" },
      width: { minimum: 1, type: "integer" },
      x: { minimum: 0, type: "integer" },
      y: { minimum: 0, type: "integer" },
    },
    required: ["height", "width", "x", "y"],
    type: "object",
  },
  WorkSummary: {
    properties: {
      calligrapherId: { format: "uuid", type: "string" },
      id: { format: "uuid", type: "string" },
      title: { type: "string" },
    },
    required: ["calligrapherId", "id", "title"],
    type: "object",
  },
};

function findOperation(
  document: OpenAPIObject,
  operationId: string,
): JsonOperation {
  for (const path of Object.values(document.paths)) {
    for (const operation of Object.values(path ?? {})) {
      if (
        operation &&
        typeof operation === "object" &&
        "operationId" in operation &&
        operation.operationId === operationId
      ) {
        return operation as JsonOperation;
      }
    }
  }
  throw new Error(`OpenAPI operation ${operationId} is missing.`);
}

function setJsonResponse(
  operation: JsonOperation,
  status: number,
  schemaName: string,
  description: string,
): void {
  operation.responses ??= {};
  operation.responses[String(status)] = {
    description,
    ...jsonContent(schemaName),
  };
}

function setJsonRequest(
  operation: JsonOperation,
  schemaName: string,
  required = true,
): void {
  operation.requestBody = { required, ...jsonContent(schemaName) };
}

function setJsonArrayResponse(
  operation: JsonOperation,
  status: number,
  schemaName: string,
  description: string,
): void {
  operation.responses ??= {};
  operation.responses[String(status)] = {
    content: {
      "application/json": {
        schema: {
          items: { $ref: `#/components/schemas/${schemaName}` },
          type: "array",
        },
      },
    },
    description,
  };
}

function setPathParameter(
  operation: JsonOperation,
  name: string,
  schema: Record<string, unknown> = { type: "string" },
): void {
  let matched = false;
  operation.parameters = (operation.parameters ?? []).map((parameter) =>
    parameter &&
    typeof parameter === "object" &&
    "name" in parameter &&
    parameter.name === name
      ? ((matched = true), { ...parameter, schema })
      : parameter,
  );
  if (!matched) {
    operation.parameters.push({ in: "path", name, required: true, schema });
  }
}

export const typedClientOperationIds = [
  "IdentityController_createAnonymousSession",
  "IdentityController_createRefreshableSession",
  "IdentityController_refresh",
  "IdentityController_revoke",
  "CatalogController_findGlyphs",
  "GlyphController_getDetail",
  "UploadController_createUpload",
  "UploadController_completeUpload",
  "UploadController_cancelUpload",
  "AnalysisController_getArtwork",
  "AnalysisController_confirmCharacter",
  "PrivacyController_get",
  "PrivacyController_update",
  "HealthController_getHealth",
  "InsightsController_track",
  "PracticeController_createPractice",
  "PracticeController_listPractices",
  "PracticeController_getPractice",
  "PracticeController_addAttempt",
  "PracticeController_createShare",
  "PracticeController_revokeShare",
  "PracticeController_createFavoriteGroup",
  "PracticeController_updateFavoriteGroup",
  "PracticeController_removeFavoriteGroup",
  "PracticeController_reorderFavoriteGroup",
  "PracticeController_favorite",
  "PracticeController_listFavorites",
  "PracticeController_reorderFavorite",
  "PracticeController_unfavorite",
  "PracticeController_deleteArtwork",
  "PracticeController_getArtworkDeletion",
  "FeedbackController_submit",
  "FeedbackController_list",
  "PublicShareController_getShare",
  "PublicShareController_getShareSummary",
] as const;

export function enhanceOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas = {
    ...(document.components.schemas ?? {}),
    ...schemas,
  };

  for (const id of [
    "IdentityController_createAnonymousSession",
    "IdentityController_createRefreshableSession",
    "IdentityController_refresh",
  ]) {
    setJsonResponse(
      findOperation(document, id),
      201,
      "IdentitySession",
      "会话已签发。",
    );
  }
  const refreshable = findOperation(
    document,
    "IdentityController_createRefreshableSession",
  );
  refreshable.security = [{ bearer: [] }];
  const refresh = findOperation(document, "IdentityController_refresh");
  setJsonRequest(refresh, "RefreshTokenRequest");
  const revoke = findOperation(document, "IdentityController_revoke");
  setJsonRequest(revoke, "RefreshTokenRequest");
  setJsonResponse(revoke, 201, "RevokeSessionResult", "撤销请求已处理。");

  const catalog = findOperation(document, "CatalogController_findGlyphs");
  setPathParameter(catalog, "character");
  catalog.parameters = [
    ...(catalog.parameters ?? []),
    {
      in: "query",
      name: "calligrapherId",
      schema: { format: "uuid", type: "string" },
    },
    { in: "query", name: "workId", schema: { format: "uuid", type: "string" } },
    {
      in: "query",
      name: "scriptStyle",
      schema: { enum: ["REGULAR"], type: "string" },
    },
  ];
  setJsonResponse(catalog, 200, "CatalogGlyphResult", "已审核的公开范字结果。");
  setJsonResponse(
    findOperation(document, "GlyphController_getDetail"),
    200,
    "GlyphDetail",
    "公开范字来源详情。",
  );
  const glyphDetail = findOperation(document, "GlyphController_getDetail");
  setPathParameter(glyphDetail, "glyphId", {
    format: "uuid",
    type: "string",
  });

  const createUpload = findOperation(document, "UploadController_createUpload");
  createUpload.security = [{ bearer: [] }];
  setJsonRequest(createUpload, "CreateUploadRequest");
  setJsonResponse(createUpload, 201, "CreateUploadResult", "上传会话已创建。");
  const completeUpload = findOperation(
    document,
    "UploadController_completeUpload",
  );
  completeUpload.security = [{ bearer: [] }];
  setPathParameter(completeUpload, "uploadId", {
    format: "uuid",
    type: "string",
  });
  setJsonResponse(
    completeUpload,
    201,
    "CompleteUploadResult",
    "上传已校验并进入质检。",
  );
  const cancelUpload = findOperation(document, "UploadController_cancelUpload");
  cancelUpload.security = [{ bearer: [] }];
  setPathParameter(cancelUpload, "uploadId", {
    format: "uuid",
    type: "string",
  });
  setJsonResponse(
    cancelUpload,
    201,
    "CancelUploadResult",
    "上传已取消并清理。",
  );

  const getArtwork = findOperation(document, "AnalysisController_getArtwork");
  getArtwork.security = [{ bearer: [] }];
  setPathParameter(getArtwork, "artworkId", {
    format: "uuid",
    type: "string",
  });
  setJsonResponse(getArtwork, 200, "ArtworkAnalysisView", "作品质检状态。");
  const confirmCharacter = findOperation(
    document,
    "AnalysisController_confirmCharacter",
  );
  confirmCharacter.security = [{ bearer: [] }];
  setPathParameter(confirmCharacter, "artworkId", {
    format: "uuid",
    type: "string",
  });
  setJsonRequest(confirmCharacter, "CharacterConfirmationRequest");
  setJsonResponse(
    confirmCharacter,
    201,
    "CharacterConfirmationResult",
    "汉字已确认。",
  );

  const getPrivacy = findOperation(document, "PrivacyController_get");
  getPrivacy.security = [{ bearer: [] }];
  setJsonResponse(getPrivacy, 200, "PrivacyPreferences", "当前隐私偏好。");
  const updatePrivacy = findOperation(document, "PrivacyController_update");
  updatePrivacy.security = [{ bearer: [] }];
  setJsonRequest(updatePrivacy, "PrivacyPreferencesUpdate");
  setJsonResponse(updatePrivacy, 200, "PrivacyPreferences", "隐私偏好已更新。");

  const authenticated = (operationId: string): JsonOperation => {
    const operation = findOperation(document, operationId);
    operation.security = [{ bearer: [] }];
    return operation;
  };
  const authenticatedWithUuid = (
    operationId: string,
    parameterName: string,
  ): JsonOperation => {
    const operation = authenticated(operationId);
    setPathParameter(operation, parameterName, {
      format: "uuid",
      type: "string",
    });
    return operation;
  };

  setJsonResponse(
    findOperation(document, "HealthController_getHealth"),
    200,
    "HealthResult",
    "服务健康状态。",
  );

  const trackEvent = authenticated("InsightsController_track");
  setJsonRequest(trackEvent, "ProductEventRequest");
  setJsonResponse(trackEvent, 201, "ProductEventResult", "业务事件已记录。");

  const createPractice = authenticated("PracticeController_createPractice");
  setJsonRequest(createPractice, "CreatePracticeRequest");
  setJsonResponse(createPractice, 201, "PracticeView", "练习会话已创建。");
  setJsonArrayResponse(
    authenticated("PracticeController_listPractices"),
    200,
    "PracticeView",
    "当前用户的练习历史。",
  );
  setJsonResponse(
    authenticatedWithUuid("PracticeController_getPractice", "sessionId"),
    200,
    "PracticeView",
    "练习会话详情。",
  );
  const addAttempt = authenticatedWithUuid(
    "PracticeController_addAttempt",
    "sessionId",
  );
  setJsonRequest(addAttempt, "PracticeAttemptRequest");
  setJsonResponse(addAttempt, 201, "PracticeView", "再次练习已加入会话。");
  setJsonResponse(
    authenticatedWithUuid("PracticeController_createShare", "sessionId"),
    201,
    "ShareResult",
    "私密练习分享已创建。",
  );
  setJsonResponse(
    authenticatedWithUuid("PracticeController_revokeShare", "shareId"),
    200,
    "RevokeShareResult",
    "分享已撤销。",
  );

  const createFavoriteGroup = authenticated(
    "PracticeController_createFavoriteGroup",
  );
  setJsonRequest(createFavoriteGroup, "CreateFavoriteGroupRequest");
  setJsonResponse(
    createFavoriteGroup,
    201,
    "FavoriteGroupResult",
    "收藏分组已创建。",
  );
  const updateFavoriteGroup = authenticatedWithUuid(
    "PracticeController_updateFavoriteGroup",
    "groupId",
  );
  setJsonRequest(updateFavoriteGroup, "UpdateFavoriteGroupRequest");
  setJsonResponse(
    updateFavoriteGroup,
    200,
    "UpdateFavoriteGroupResult",
    "收藏分组已更新。",
  );
  setJsonResponse(
    authenticatedWithUuid("PracticeController_removeFavoriteGroup", "groupId"),
    200,
    "DeleteFavoriteGroupResult",
    "收藏分组已删除。",
  );
  const reorderFavoriteGroup = authenticatedWithUuid(
    "PracticeController_reorderFavoriteGroup",
    "groupId",
  );
  setJsonRequest(reorderFavoriteGroup, "ReorderRequest");
  setJsonResponse(
    reorderFavoriteGroup,
    201,
    "ReorderResult",
    "收藏分组已重新排序。",
  );

  const favorite = authenticatedWithUuid(
    "PracticeController_favorite",
    "glyphId",
  );
  setJsonRequest(favorite, "FavoritePlacementRequest", false);
  setJsonResponse(favorite, 200, "FavoriteStateResult", "范字已收藏。");
  setJsonResponse(
    authenticated("PracticeController_listFavorites"),
    200,
    "FavoriteLibrary",
    "当前用户的收藏字帖。",
  );
  const reorderFavorite = authenticatedWithUuid(
    "PracticeController_reorderFavorite",
    "glyphId",
  );
  setJsonRequest(reorderFavorite, "ReorderRequest");
  setJsonResponse(
    reorderFavorite,
    201,
    "ReorderResult",
    "收藏范字已重新排序。",
  );
  setJsonResponse(
    authenticatedWithUuid("PracticeController_unfavorite", "glyphId"),
    200,
    "FavoriteStateResult",
    "范字收藏已取消。",
  );

  setJsonResponse(
    authenticatedWithUuid("PracticeController_deleteArtwork", "artworkId"),
    200,
    "ArtworkDeletionView",
    "作品逻辑删除及物理清理状态。",
  );
  setJsonResponse(
    authenticatedWithUuid(
      "PracticeController_getArtworkDeletion",
      "deletionId",
    ),
    200,
    "ArtworkDeletionView",
    "作品物理清理状态。",
  );

  const submitFeedback = authenticated("FeedbackController_submit");
  setJsonRequest(submitFeedback, "FeedbackSubmitRequest");
  setJsonResponse(
    submitFeedback,
    201,
    "FeedbackCreatedResult",
    "反馈工单已创建。",
  );
  setJsonArrayResponse(
    authenticated("FeedbackController_list"),
    200,
    "UserFeedbackTicket",
    "当前用户的反馈工单。",
  );

  for (const [operationId, schemaName, description] of [
    ["PublicShareController_getShare", "PracticeView", "公开练习分享。"],
    [
      "PublicShareController_getShareSummary",
      "ShareSummary",
      "不包含用户图片地址的公开分享摘要。",
    ],
  ] as const) {
    const operation = findOperation(document, operationId);
    setPathParameter(operation, "token", {
      pattern: "^[A-Za-z0-9_-]{40,60}$",
      type: "string",
    });
    setJsonResponse(operation, 200, schemaName, description);
  }
  for (const operationId of typedClientOperationIds) {
    findOperation(document, operationId)["x-client-contract"] = true;
  }
  return document;
}
