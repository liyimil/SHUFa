import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BadRequestException } from "@nestjs/common";

import {
  contentImportTemplate,
  parseContentImportCsv,
} from "../src/admin/content-import.csv.js";

const validRow =
  "53a3e68c-c38c-4b79-90b4-ab1212491184,永,永,永,,,B_RUBBING_OR_AUTHORIZED_EDITION,20,30,100,120,75,60";

describe("content import CSV", () => {
  it("parses the exact BOM template and quoted fields", () => {
    const rows = parseContentImportCsv(
      `${contentImportTemplate}53a3e68c-c38c-4b79-90b4-ab1212491184,𠮷,吉,𠮷、吉,HISTORICAL,"永和,""九年""",B_RUBBING_OR_AUTHORIZED_EDITION,20,30,100,120,75,60\r\n`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.rowNumber, 2);
    assert.equal(rows[0]?.rawData.transcription, '永和,"九年"');
  });

  it("rejects a modified header instead of guessing column meanings", () => {
    assert.throws(
      () =>
        parseContentImportCsv(
          `${contentImportTemplate.replace("source_asset_id", "source_id")}${validRow}`,
        ),
      BadRequestException,
    );
  });

  it("rejects unclosed quoted content", () => {
    assert.throws(
      () => parseContentImportCsv(`${contentImportTemplate}"${validRow}`),
      BadRequestException,
    );
  });

  it("rejects characters appended after a closed quoted field", () => {
    assert.throws(
      () =>
        parseContentImportCsv(
          `${contentImportTemplate}${validRow.replace(",,,B_", ',"释文"意外字符,,B_')}`,
        ),
      BadRequestException,
    );
  });

  it("caps one batch at 200 rows", () => {
    assert.throws(
      () =>
        parseContentImportCsv(
          `${contentImportTemplate}${Array.from({ length: 201 }, () => validRow).join("\n")}`,
        ),
      BadRequestException,
    );
  });
});
