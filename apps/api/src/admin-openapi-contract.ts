type ContractSchema = Record<string, unknown>;

const uuid = { format: "uuid", type: "string" };
const dateTime = { format: "date-time", type: "string" };
const nullableString = { nullable: true, type: "string" };
const nullableDateTime = {
  format: "date-time",
  nullable: true,
  type: "string",
};

const ref = (name: string): ContractSchema => ({
  $ref: `#/components/schemas/${name}`,
});

const array = (items: ContractSchema): ContractSchema => ({
  items,
  type: "array",
});

const object = (
  properties: Record<string, ContractSchema>,
  required: string[] = Object.keys(properties),
): ContractSchema => ({ properties, required, type: "object" });

const partialObject = (
  properties: Record<string, ContractSchema>,
): ContractSchema => ({
  minProperties: 1,
  properties,
  type: "object",
});

const adminRoles = ["EDITOR", "REVIEWER", "RIGHTS", "ADMIN"];
const rightsStatuses = [
  "UNKNOWN",
  "INTERNAL_TEST_ONLY",
  "CLEARED_PUBLIC",
  "RESTRICTED",
  "EXPIRED",
];
const authenticityGrades = [
  "A_ORIGINAL",
  "B_RUBBING_OR_AUTHORIZED_EDITION",
  "C_MODERN_COPY",
];
const feedbackKinds = [
  "STRUCTURE_ADVICE",
  "RECOGNITION_ERROR",
  "QUALITY_RESULT",
  "CONTENT_ERROR",
  "PRODUCT",
];
const feedbackStatuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"];
const productEventNames = [
  "ARTWORK_UPLOAD_COMPLETED",
  "CHARACTER_CONFIRMED",
  "CATALOG_RESULTS_VIEWED",
  "GLYPH_SELECTED",
  "PRACTICE_CREATED",
  "ADVICE_VIEWED",
  "SECOND_ATTEMPT_STARTED",
  "PRACTICE_COMPLETED",
];

const calligrapherProperties = {
  biography: nullableString,
  dynasty: { type: "string" },
  id: uuid,
  isActive: { type: "boolean" },
  name: { type: "string" },
};

const workProperties = {
  calligrapher: object({
    id: uuid,
    isActive: { type: "boolean" },
    name: { type: "string" },
  }),
  description: nullableString,
  dynasty: { type: "string" },
  id: uuid,
  isActive: { type: "boolean" },
  title: { type: "string" },
};

const editionProperties = {
  holdingInstitution: nullableString,
  id: uuid,
  isActive: { type: "boolean" },
  name: { type: "string" },
  publication: nullableString,
  sourceUrl: { format: "uri", nullable: true, type: "string" },
  work: object({
    calligrapher: object({ isActive: { type: "boolean" } }),
    id: uuid,
    isActive: { type: "boolean" },
    title: { type: "string" },
  }),
};

const rightsProperties = {
  allowCommercial: { type: "boolean" },
  attributionText: nullableString,
  id: uuid,
  licenseName: nullableString,
  maxPublicWidth: { minimum: 1, nullable: true, type: "integer" },
  notes: nullableString,
  sourceName: { type: "string" },
  sourceUrl: { format: "uri", nullable: true, type: "string" },
  status: { enum: rightsStatuses, type: "string" },
  validFrom: nullableDateTime,
  validUntil: nullableDateTime,
};

const createGlyphProperties = {
  authenticityGrade: { enum: authenticityGrades, type: "string" },
  bboxHeight: { minimum: 1, type: "integer" },
  bboxWidth: { minimum: 1, type: "integer" },
  bboxX: { minimum: 0, type: "integer" },
  bboxY: { minimum: 0, type: "integer" },
  beginnerWeight: { maximum: 100, minimum: 0, type: "integer" },
  canonicalCharacter: { minLength: 1, type: "string" },
  characterCandidates: array({ minLength: 1, type: "string" }),
  imageQuality: { maximum: 100, minimum: 0, type: "integer" },
  observedCharacter: { minLength: 1, type: "string" },
  sourceAssetId: uuid,
  transcription: nullableString,
  variantType: {
    enum: ["SIMPLIFIED", "TRADITIONAL", "HISTORICAL", "COMPATIBILITY", null],
    nullable: true,
    type: "string",
  },
};

export const adminContractSchemas: Record<string, ContractSchema> = {
  AdminSessionRequest: object({
    email: { format: "email", maxLength: 254, type: "string" },
    password: { minLength: 1, type: "string", writeOnly: true },
  }),
  AdminSession: object({
    accessToken: { type: "string" },
    expiresInSeconds: { minimum: 1, type: "integer" },
    staff: object({
      email: { format: "email", type: "string" },
      roles: array({ enum: adminRoles, type: "string" }),
    }),
    tokenType: { enum: ["Bearer"], type: "string" },
  }),
  AdminCalligrapher: object(calligrapherProperties),
  CreateCalligrapherRequest: object(
    {
      biography: nullableString,
      dynasty: { maxLength: 64, minLength: 1, type: "string" },
      name: { maxLength: 100, minLength: 1, type: "string" },
    },
    ["dynasty", "name"],
  ),
  UpdateCalligrapherRequest: partialObject({
    biography: nullableString,
    dynasty: { maxLength: 64, minLength: 1, type: "string" },
    isActive: { type: "boolean" },
    name: { maxLength: 100, minLength: 1, type: "string" },
  }),
  AdminWork: object(workProperties),
  CreateWorkRequest: object(
    {
      calligrapherId: uuid,
      description: nullableString,
      dynasty: { maxLength: 64, minLength: 1, type: "string" },
      title: { maxLength: 200, minLength: 1, type: "string" },
    },
    ["calligrapherId", "dynasty", "title"],
  ),
  UpdateWorkRequest: partialObject({
    description: nullableString,
    dynasty: { maxLength: 64, minLength: 1, type: "string" },
    isActive: { type: "boolean" },
    title: { maxLength: 200, minLength: 1, type: "string" },
  }),
  AdminEdition: object(editionProperties),
  CreateEditionRequest: object(
    {
      holdingInstitution: nullableString,
      name: { maxLength: 200, minLength: 1, type: "string" },
      publication: nullableString,
      sourceUrl: { format: "uri", nullable: true, type: "string" },
      workId: uuid,
    },
    ["name", "workId"],
  ),
  UpdateEditionRequest: partialObject({
    holdingInstitution: nullableString,
    isActive: { type: "boolean" },
    name: { maxLength: 200, minLength: 1, type: "string" },
    publication: nullableString,
    sourceUrl: { format: "uri", nullable: true, type: "string" },
  }),
  AdminRights: object(rightsProperties),
  CreateRightsRequest: object(
    {
      allowCommercial: { type: "boolean" },
      attributionText: nullableString,
      licenseName: nullableString,
      maxPublicWidth: { minimum: 1, nullable: true, type: "integer" },
      notes: nullableString,
      sourceName: { maxLength: 200, minLength: 1, type: "string" },
      sourceUrl: { format: "uri", nullable: true, type: "string" },
      status: {
        enum: ["INTERNAL_TEST_ONLY", "CLEARED_PUBLIC", "RESTRICTED"],
        type: "string",
      },
      validFrom: nullableDateTime,
      validUntil: nullableDateTime,
    },
    ["sourceName", "status"],
  ),
  UpdateRightsRequest: partialObject({
    ...rightsProperties,
    id: undefined as unknown as ContractSchema,
  }),
  ContentHistoryChange: object({
    after: {},
    before: {},
    field: { type: "string" },
  }),
  AdminContentHistoryEntry: object({
    action: { type: "string" },
    actorKey: { type: "string" },
    canRestore: { type: "boolean" },
    changes: array(ref("ContentHistoryChange")),
    createdAt: dateTime,
    entityId: uuid,
    entityType: {
      enum: ["Calligrapher", "Work", "WorkEdition", "RightsRecord", "Glyph"],
      type: "string",
    },
    id: uuid,
    snapshot: {},
  }),
  ContentImportPreviewRequest: object({
    csvText: { maxLength: 2_000_000, type: "string" },
    fileName: { maxLength: 255, pattern: "\\.csv$", type: "string" },
  }),
  ContentImportRow: object({
    errors: array({ type: "string" }),
    normalizedData: {
      additionalProperties: true,
      nullable: true,
      type: "object",
    },
    rawData: { additionalProperties: { type: "string" }, type: "object" },
    rowNumber: { minimum: 2, type: "integer" },
    targetGlyphId: { format: "uuid", nullable: true, type: "string" },
  }),
  AdminContentImportBatch: object({
    actorKey: { type: "string" },
    checksumSha256: { pattern: "^[0-9a-f]{64}$", type: "string" },
    committedAt: nullableDateTime,
    createdAt: dateTime,
    fileName: { type: "string" },
    id: uuid,
    invalidRows: { minimum: 0, type: "integer" },
    rows: array(ref("ContentImportRow")),
    status: { enum: ["INVALID", "READY", "COMMITTED"], type: "string" },
    totalRows: { minimum: 0, type: "integer" },
    validRows: { minimum: 0, type: "integer" },
  }),
  ContentImportCommitResult: object({
    batchId: uuid,
    glyphCount: { minimum: 0, type: "integer" },
    status: { enum: ["COMMITTED"], type: "string" },
  }),
  CreateSourceUploadRequest: object(
    {
      checksumSha256: { pattern: "^[0-9a-fA-F]{64}$", type: "string" },
      editionId: uuid,
      height: { maximum: 30000, minimum: 512, type: "integer" },
      mimeType: {
        enum: ["image/jpeg", "image/png", "image/webp"],
        type: "string",
      },
      pageLabel: nullableString,
      rightsRecordId: uuid,
      sizeBytes: { maximum: 52428800, minimum: 1, type: "integer" },
      width: { maximum: 30000, minimum: 512, type: "integer" },
    },
    [
      "checksumSha256",
      "editionId",
      "height",
      "mimeType",
      "rightsRecordId",
      "sizeBytes",
      "width",
    ],
  ),
  CreateSourceUploadResult: object({
    expiresAt: dateTime,
    requiredHeaders: object({
      "content-type": {
        enum: ["image/jpeg", "image/png", "image/webp"],
        type: "string",
      },
      "x-amz-meta-sha256": { pattern: "^[0-9a-f]{64}$", type: "string" },
    }),
    uploadId: uuid,
    uploadUrl: { format: "uri", type: "string" },
  }),
  CompleteSourceUploadResult: object({ sourceAssetId: uuid }),
  AdminSourceAsset: object({
    edition: object({
      name: { type: "string" },
      work: object({ title: { type: "string" } }),
    }),
    height: { minimum: 1, type: "integer" },
    id: uuid,
    pageLabel: nullableString,
    width: { minimum: 1, type: "integer" },
  }),
  PrivateSourceView: object({
    expiresAt: dateTime,
    height: { minimum: 1, type: "integer" },
    mimeType: {
      enum: ["image/jpeg", "image/png", "image/webp"],
      type: "string",
    },
    url: { format: "uri", type: "string" },
    width: { minimum: 1, type: "integer" },
  }),
  SegmentationCandidate: object({
    annotatedAt: nullableDateTime,
    annotatedBy: nullableString,
    bboxHeight: { minimum: 1, type: "integer" },
    bboxWidth: { minimum: 1, type: "integer" },
    bboxX: { minimum: 0, type: "integer" },
    bboxY: { minimum: 0, type: "integer" },
    confidence: { maximum: 1, minimum: 0, type: "number" },
    glyphId: { format: "uuid", nullable: true, type: "string" },
    id: uuid,
    rejectionNote: nullableString,
    sortOrder: { minimum: 0, type: "integer" },
    status: { type: "string" },
  }),
  AdminSegmentationJob: object({
    algorithmVersion: nullableString,
    candidates: array(ref("SegmentationCandidate")),
    completedAt: nullableDateTime,
    createdAt: dateTime,
    failureCode: nullableString,
    failureMessage: nullableString,
    id: uuid,
    requestedBy: { type: "string" },
    sourceAsset: ref("AdminSourceAsset"),
    startedAt: nullableDateTime,
    status: {
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      type: "string",
    },
  }),
  CreateSegmentationJobResult: object({
    created: { type: "boolean" },
    jobId: uuid,
    status: { enum: ["PENDING", "PROCESSING"], type: "string" },
  }),
  RejectSegmentationCandidateRequest: object({
    note: { maxLength: 2000, minLength: 1, type: "string" },
  }),
  RejectSegmentationCandidateResult: object({
    candidateId: uuid,
    status: { enum: ["REJECTED"], type: "string" },
  }),
  CreateGlyphRequest: object(createGlyphProperties, [
    "authenticityGrade",
    "bboxHeight",
    "bboxWidth",
    "bboxX",
    "bboxY",
    "canonicalCharacter",
    "observedCharacter",
    "sourceAssetId",
  ]),
  AcceptSegmentationCandidateRequest: object(
    Object.fromEntries(
      Object.entries(createGlyphProperties).filter(
        ([name]) => name !== "sourceAssetId",
      ),
    ),
    ["authenticityGrade", "canonicalCharacter", "observedCharacter"],
  ),
  UpdateGlyphRequest: partialObject({
    ...createGlyphProperties,
    sourceAssetId: undefined as unknown as ContractSchema,
  }),
  GlyphMutationResult: object({
    glyphId: uuid,
    status: {
      enum: [
        "PROCESSING",
        "NEEDS_REVIEW",
        "APPROVED",
        "DRAFT",
        "ARCHIVED",
        "PUBLISHED",
      ],
      type: "string",
    },
  }),
  GlyphReviewRequest: object(
    {
      decision: {
        enum: ["APPROVED", "CHANGES_REQUESTED", "REJECTED"],
        type: "string",
      },
      note: nullableString,
    },
    ["decision"],
  ),
  GlyphUnpublishRequest: object({
    reason: { maxLength: 2000, minLength: 1, type: "string" },
  }),
  AdminGlyph: object({
    annotatedBy: nullableString,
    authenticityGrade: {
      enum: [...authenticityGrades, "D_AI_GENERATED"],
      type: "string",
    },
    bboxHeight: { minimum: 1, type: "integer" },
    bboxWidth: { minimum: 1, type: "integer" },
    bboxX: { minimum: 0, type: "integer" },
    bboxY: { minimum: 0, type: "integer" },
    beginnerWeight: { maximum: 100, minimum: 0, type: "number" },
    character: object({ value: { type: "string" } }),
    contentStatus: { type: "string" },
    id: uuid,
    imageQuality: { maximum: 100, minimum: 0, type: "number" },
    labelCandidates: {},
    observedCharacter: nullableString,
    sourceAsset: object({
      edition: object({ work: object({ title: { type: "string" } }) }),
    }),
    transcription: nullableString,
  }),
  RestoredAdminContent: {
    oneOf: [
      ref("AdminCalligrapher"),
      ref("AdminWork"),
      ref("AdminEdition"),
      ref("AdminRights"),
      ref("GlyphMutationResult"),
    ],
  },
  AdminFeedbackTicket: object({
    accurate: { nullable: true, type: "boolean" },
    assignedTo: nullableString,
    createdAt: dateTime,
    id: uuid,
    kind: { enum: feedbackKinds, type: "string" },
    message: nullableString,
    referenceId: { format: "uuid", nullable: true, type: "string" },
    referenceType: nullableString,
    resolutionNote: nullableString,
    resolvedAt: nullableDateTime,
    status: { enum: feedbackStatuses, type: "string" },
    updatedAt: dateTime,
  }),
  AdminFeedbackUpdateRequest: partialObject({
    assignedTo: nullableString,
    resolutionNote: nullableString,
    status: { enum: feedbackStatuses, type: "string" },
  }),
  AdviceReview: object({
    comment: { type: "string" },
    reviewedAt: dateTime,
    reviewerKey: { type: "string" },
    verdict: {
      enum: ["APPROVED", "NEEDS_ADJUSTMENT", "NOT_APPLICABLE"],
      type: "string",
    },
  }),
  AdminAdviceSample: object({
    advice: ref("PracticeAdvice"),
    attemptCreatedAt: dateTime,
    attemptId: uuid,
    character: { type: "string" },
    master: object({
      calligrapherName: { type: "string" },
      imageUrl: { format: "uri", nullable: true, type: "string" },
      workTitle: { type: "string" },
    }),
    practiceSessionId: uuid,
    review: { allOf: [ref("AdviceReview")], nullable: true },
    sequence: { minimum: 1, type: "integer" },
    userImageUrl: { format: "uri", type: "string" },
  }),
  AdviceReviewRequest: object({
    comment: { maxLength: 2000, minLength: 3, type: "string" },
    verdict: {
      enum: ["APPROVED", "NEEDS_ADJUSTMENT", "NOT_APPLICABLE"],
      type: "string",
    },
  }),
  AdviceReviewResult: object({
    attemptId: uuid,
    status: { enum: ["REVIEWED"], type: "string" },
    verdict: {
      enum: ["APPROVED", "NEEDS_ADJUSTMENT", "NOT_APPLICABLE"],
      type: "string",
    },
  }),
  AdminFunnelStage: object({
    conversionFromPrevious: { nullable: true, type: "number" },
    count: { minimum: 0, type: "integer" },
    name: { enum: productEventNames, type: "string" },
  }),
  AdminFunnelReport: object({
    completionRate: { nullable: true, type: "number" },
    from: dateTime,
    stages: array(ref("AdminFunnelStage")),
    to: dateTime,
  }),
};

// Remove fields deliberately omitted from partial schemas. Keeping the omission
// here avoids duplicating large property maps while still producing concrete JSON.
delete (
  adminContractSchemas.UpdateRightsRequest as {
    properties: Record<string, unknown>;
  }
).properties.id;
delete (
  adminContractSchemas.UpdateGlyphRequest as {
    properties: Record<string, unknown>;
  }
).properties.sourceAssetId;

export interface AdminOperationContract {
  arrayResponse?: boolean;
  contentType?: string;
  operationId: string;
  parameters?: Array<{
    format?: string;
    in: "path" | "query";
    name: string;
    required?: boolean;
    schema?: ContractSchema;
  }>;
  requestSchema?: string;
  responseSchema: string;
  responseStatus: number;
  secured?: boolean;
}

const secured = true;

export const adminOperationContracts: AdminOperationContract[] = [
  {
    operationId: "AdminSessionController_createSession",
    requestSchema: "AdminSessionRequest",
    responseSchema: "AdminSession",
    responseStatus: 201,
  },
  {
    operationId: "ContentAdminController_listCalligraphers",
    arrayResponse: true,
    responseSchema: "AdminCalligrapher",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_createCalligrapher",
    requestSchema: "CreateCalligrapherRequest",
    responseSchema: "AdminCalligrapher",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_updateCalligrapher",
    parameters: [
      { format: "uuid", in: "path", name: "calligrapherId", required: true },
    ],
    requestSchema: "UpdateCalligrapherRequest",
    responseSchema: "AdminCalligrapher",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_listWorks",
    arrayResponse: true,
    responseSchema: "AdminWork",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_createWork",
    requestSchema: "CreateWorkRequest",
    responseSchema: "AdminWork",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_updateWork",
    parameters: [
      { format: "uuid", in: "path", name: "workId", required: true },
    ],
    requestSchema: "UpdateWorkRequest",
    responseSchema: "AdminWork",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_listEditions",
    arrayResponse: true,
    responseSchema: "AdminEdition",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_createEdition",
    requestSchema: "CreateEditionRequest",
    responseSchema: "AdminEdition",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_updateEdition",
    parameters: [
      { format: "uuid", in: "path", name: "editionId", required: true },
    ],
    requestSchema: "UpdateEditionRequest",
    responseSchema: "AdminEdition",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_listRights",
    arrayResponse: true,
    responseSchema: "AdminRights",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_createRights",
    requestSchema: "CreateRightsRequest",
    responseSchema: "AdminRights",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_updateRights",
    parameters: [
      { format: "uuid", in: "path", name: "rightsId", required: true },
    ],
    requestSchema: "UpdateRightsRequest",
    responseSchema: "AdminRights",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_listContentHistory",
    arrayResponse: true,
    parameters: [
      {
        in: "query",
        name: "entityType",
        required: true,
        schema: {
          enum: [
            "Calligrapher",
            "Work",
            "WorkEdition",
            "RightsRecord",
            "Glyph",
          ],
          type: "string",
        },
      },
      { format: "uuid", in: "query", name: "entityId", required: true },
    ],
    responseSchema: "AdminContentHistoryEntry",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_restoreContentHistory",
    parameters: [
      { format: "uuid", in: "path", name: "auditId", required: true },
    ],
    responseSchema: "RestoredAdminContent",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_contentImportTemplate",
    contentType: "text/csv",
    responseSchema: "CsvDocument",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_listContentImportBatches",
    arrayResponse: true,
    responseSchema: "AdminContentImportBatch",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_previewContentImport",
    requestSchema: "ContentImportPreviewRequest",
    responseSchema: "AdminContentImportBatch",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_commitContentImport",
    parameters: [
      { format: "uuid", in: "path", name: "batchId", required: true },
    ],
    responseSchema: "ContentImportCommitResult",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_createSourceUpload",
    requestSchema: "CreateSourceUploadRequest",
    responseSchema: "CreateSourceUploadResult",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_completeSourceUpload",
    parameters: [
      { format: "uuid", in: "path", name: "uploadId", required: true },
    ],
    responseSchema: "CompleteSourceUploadResult",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_listSourceAssets",
    arrayResponse: true,
    responseSchema: "AdminSourceAsset",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_createSourceAssetView",
    parameters: [
      { format: "uuid", in: "path", name: "sourceAssetId", required: true },
    ],
    responseSchema: "PrivateSourceView",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_listSegmentationJobs",
    arrayResponse: true,
    responseSchema: "AdminSegmentationJob",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_createSegmentationJob",
    parameters: [
      { format: "uuid", in: "path", name: "sourceAssetId", required: true },
    ],
    responseSchema: "CreateSegmentationJobResult",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_acceptSegmentationCandidate",
    parameters: [
      { format: "uuid", in: "path", name: "candidateId", required: true },
    ],
    requestSchema: "AcceptSegmentationCandidateRequest",
    responseSchema: "GlyphMutationResult",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_rejectSegmentationCandidate",
    parameters: [
      { format: "uuid", in: "path", name: "candidateId", required: true },
    ],
    requestSchema: "RejectSegmentationCandidateRequest",
    responseSchema: "RejectSegmentationCandidateResult",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_listGlyphs",
    arrayResponse: true,
    responseSchema: "AdminGlyph",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_createGlyph",
    requestSchema: "CreateGlyphRequest",
    responseSchema: "GlyphMutationResult",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_updateGlyph",
    parameters: [
      { format: "uuid", in: "path", name: "glyphId", required: true },
    ],
    requestSchema: "UpdateGlyphRequest",
    responseSchema: "GlyphMutationResult",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "ContentAdminController_reviewGlyph",
    parameters: [
      { format: "uuid", in: "path", name: "glyphId", required: true },
    ],
    requestSchema: "GlyphReviewRequest",
    responseSchema: "GlyphMutationResult",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_publishGlyph",
    parameters: [
      { format: "uuid", in: "path", name: "glyphId", required: true },
    ],
    responseSchema: "GlyphMutationResult",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "ContentAdminController_unpublishGlyph",
    parameters: [
      { format: "uuid", in: "path", name: "glyphId", required: true },
    ],
    requestSchema: "GlyphUnpublishRequest",
    responseSchema: "GlyphMutationResult",
    responseStatus: 201,
    secured,
  },
  {
    operationId: "AdminFeedbackController_list",
    arrayResponse: true,
    parameters: [
      {
        in: "query",
        name: "kind",
        schema: { enum: feedbackKinds, type: "string" },
      },
      {
        in: "query",
        name: "status",
        schema: { enum: feedbackStatuses, type: "string" },
      },
    ],
    responseSchema: "AdminFeedbackTicket",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "AdminFeedbackController_update",
    parameters: [
      { format: "uuid", in: "path", name: "feedbackId", required: true },
    ],
    requestSchema: "AdminFeedbackUpdateRequest",
    responseSchema: "AdminFeedbackTicket",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "AdminInsightsController_listAdviceSamples",
    arrayResponse: true,
    parameters: [
      {
        in: "query",
        name: "status",
        schema: { enum: ["ALL", "REVIEWED", "UNREVIEWED"], type: "string" },
      },
      {
        in: "query",
        name: "limit",
        schema: { maximum: 100, minimum: 1, type: "integer" },
      },
    ],
    responseSchema: "AdminAdviceSample",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "AdminInsightsController_reviewAdvice",
    parameters: [
      { format: "uuid", in: "path", name: "attemptId", required: true },
    ],
    requestSchema: "AdviceReviewRequest",
    responseSchema: "AdviceReviewResult",
    responseStatus: 200,
    secured,
  },
  {
    operationId: "AdminInsightsController_funnel",
    parameters: [
      { in: "query", name: "from", schema: dateTime },
      { in: "query", name: "to", schema: dateTime },
    ],
    responseSchema: "AdminFunnelReport",
    responseStatus: 200,
    secured,
  },
];

adminContractSchemas.CsvDocument = { type: "string" };
