import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { URL } from "node:url";

const document = JSON.parse(
  await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
);

function operations() {
  return Object.values(document.paths).flatMap((path) =>
    Object.values(path).filter(
      (operation) => operation && typeof operation.operationId === "string",
    ),
  );
}

describe("generated OpenAPI contract", () => {
  it("tracks every Nest public operation with a stable operation id", () => {
    const all = operations();
    assert.equal(all.length, 73);
    assert.equal(new Set(all.map(({ operationId }) => operationId)).size, 73);
  });

  it("provides response schemas for every client operation", () => {
    const typed = operations().filter(
      (operation) => operation["x-client-contract"] === true,
    );
    assert.equal(typed.length, 73);
    for (const operation of typed) {
      assert.ok(
        Object.values(operation.responses).some((response) => {
          return Object.values(response.content ?? {}).some(({ schema }) =>
            Boolean(
              schema?.$ref || (schema?.type === "array" && schema.items?.$ref),
            ),
          );
        }),
        `${operation.operationId} has no response schema`,
      );
    }
  });

  it("types every admin operation and protects all except login", () => {
    const admin = operations().filter(
      ({ operationId }) =>
        operationId.startsWith("Admin") ||
        operationId.startsWith("ContentAdmin"),
    );
    assert.equal(admin.length, 38);
    assert.ok(admin.every((operation) => operation["x-client-contract"]));
    for (const operation of admin) {
      if (operation.operationId === "AdminSessionController_createSession") {
        assert.equal(operation.security, undefined);
      } else {
        assert.deepEqual(operation.security, [{ bearer: [] }]);
      }
    }
  });

  it("types admin mutation bodies, identifiers, and non-JSON exports", () => {
    const byId = Object.fromEntries(
      operations().map((operation) => [operation.operationId, operation]),
    );
    for (const operationId of [
      "AdminSessionController_createSession",
      "ContentAdminController_createCalligrapher",
      "ContentAdminController_updateRights",
      "ContentAdminController_createSourceUpload",
      "ContentAdminController_acceptSegmentationCandidate",
      "ContentAdminController_reviewGlyph",
      "AdminFeedbackController_update",
      "AdminInsightsController_reviewAdvice",
    ]) {
      assert.ok(
        byId[operationId].requestBody.content["application/json"].schema.$ref,
        `${operationId} has no request schema`,
      );
    }
    for (const [operationId, parameterName] of [
      ["ContentAdminController_updateCalligrapher", "calligrapherId"],
      ["ContentAdminController_restoreContentHistory", "auditId"],
      ["ContentAdminController_completeSourceUpload", "uploadId"],
      ["ContentAdminController_reviewGlyph", "glyphId"],
      ["AdminFeedbackController_update", "feedbackId"],
      ["AdminInsightsController_reviewAdvice", "attemptId"],
    ]) {
      assert.equal(
        byId[operationId].parameters.find(({ name }) => name === parameterName)
          .schema.format,
        "uuid",
      );
    }
    assert.equal(
      byId.ContentAdminController_contentImportTemplate.responses[200].content[
        "text/csv"
      ].schema.$ref,
      "#/components/schemas/CsvDocument",
    );
  });

  it("keeps catalog and identity component schemas concrete", () => {
    assert.ok(document.components.schemas.IdentitySession.required.length > 0);
    assert.ok(document.components.schemas.PublishedGlyph.required.length > 0);
    assert.ok(document.components.schemas.GlyphDetail.allOf.length > 0);
  });

  it("types catalog path and filter parameters", () => {
    const operation = operations().find(
      ({ operationId }) => operationId === "CatalogController_findGlyphs",
    );
    const parameters = Object.fromEntries(
      operation.parameters.map((parameter) => [parameter.name, parameter]),
    );
    assert.equal(parameters.character.schema.type, "string");
    assert.equal(parameters.calligrapherId.schema.format, "uuid");
    assert.deepEqual(parameters.scriptStyle.schema.enum, ["REGULAR"]);
  });

  it("types authenticated upload, analysis, and privacy request bodies", () => {
    const byId = Object.fromEntries(
      operations().map((operation) => [operation.operationId, operation]),
    );
    for (const operationId of [
      "UploadController_createUpload",
      "AnalysisController_confirmCharacter",
      "PrivacyController_update",
    ]) {
      assert.deepEqual(byId[operationId].security, [{ bearer: [] }]);
      assert.ok(
        byId[operationId].requestBody.content["application/json"].schema.$ref,
      );
    }
    assert.ok(byId.UploadController_completeUpload.responses[201]);
    assert.ok(byId.AnalysisController_getArtwork.responses[200]);
    assert.equal(
      byId.UploadController_completeUpload.parameters.find(
        ({ name }) => name === "uploadId",
      ).schema.format,
      "uuid",
    );
    assert.equal(
      byId.AnalysisController_getArtwork.parameters.find(
        ({ name }) => name === "artworkId",
      ).required,
      true,
    );
  });

  it("types the authenticated App practice loop and public share boundary", () => {
    const byId = Object.fromEntries(
      operations().map((operation) => [operation.operationId, operation]),
    );
    for (const operationId of [
      "PracticeController_createPractice",
      "PracticeController_addAttempt",
      "PracticeController_listFavorites",
      "FeedbackController_submit",
      "PracticeController_deleteArtwork",
      "InsightsController_track",
    ]) {
      assert.deepEqual(byId[operationId].security, [{ bearer: [] }]);
    }
    assert.equal(
      byId.PracticeController_listPractices.responses[200].content[
        "application/json"
      ].schema.items.$ref,
      "#/components/schemas/PracticeView",
    );
    assert.equal(
      byId.FeedbackController_submit.responses[201].content["application/json"]
        .schema.$ref,
      "#/components/schemas/FeedbackCreatedResult",
    );
    assert.equal(byId.PublicShareController_getShare.security, undefined);
    assert.equal(
      byId.PublicShareController_getShare.parameters.find(
        ({ name }) => name === "token",
      ).schema.pattern,
      "^[A-Za-z0-9_-]{40,60}$",
    );
  });
});
