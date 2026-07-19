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

  it("provides JSON response schemas for every marked client operation", () => {
    const typed = operations().filter(
      (operation) => operation["x-client-contract"] === true,
    );
    assert.equal(typed.length, 35);
    for (const operation of typed) {
      assert.ok(
        Object.values(operation.responses).some((response) => {
          const schema = response.content?.["application/json"]?.schema;
          return (
            schema?.$ref || (schema?.type === "array" && schema.items?.$ref)
          );
        }),
        `${operation.operationId} has no JSON response schema`,
      );
    }
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
