import { BadRequestException } from "@nestjs/common";

export const contentImportHeaders = [
  "source_asset_id",
  "observed_character",
  "canonical_character",
  "character_candidates",
  "variant_type",
  "transcription",
  "authenticity_grade",
  "bbox_x",
  "bbox_y",
  "bbox_width",
  "bbox_height",
  "image_quality",
  "beginner_weight",
] as const;

export const contentImportTemplate = `\uFEFF${contentImportHeaders.join(",")}\r\n`;

interface CsvRecord {
  line: number;
  values: string[];
}

function invalidCsv(message: string): never {
  throw new BadRequestException({
    code: "INVALID_CONTENT_IMPORT_CSV",
    message,
  });
}

function parseRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let field = "";
  let fields: string[] = [];
  let inQuotes = false;
  let justClosedQuote = false;
  let line = 1;
  let recordLine = 1;

  const finishRecord = () => {
    fields.push(field);
    if (fields.some((value) => value.trim() !== "")) {
      records.push({ line: recordLine, values: fields });
    }
    field = "";
    fields = [];
    justClosedQuote = false;
    recordLine = line + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        field += character;
        if (character === "\n") line += 1;
      }
      continue;
    }
    if (justClosedQuote && ![",", "\r", "\n"].includes(character)) {
      invalidCsv(`第 ${line} 行引号后的字符无效。`);
    }
    if (character === '"') {
      if (field.length !== 0) invalidCsv(`第 ${line} 行引号位置无效。`);
      inQuotes = true;
    } else if (character === ",") {
      fields.push(field);
      field = "";
      justClosedQuote = false;
    } else if (character === "\n") {
      finishRecord();
      line += 1;
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (inQuotes) invalidCsv(`第 ${recordLine} 行存在未闭合的引号。`);
  if (field.length > 0 || fields.length > 0) finishRecord();
  return records;
}

export interface ParsedContentImportRow {
  rawData: Record<string, string>;
  rowNumber: number;
}

export function parseContentImportCsv(text: string): ParsedContentImportRow[] {
  if (!text || text.length > 80_000) {
    invalidCsv("CSV 不能为空且不能超过 80,000 个字符。");
  }
  const records = parseRecords(text.replace(/^\uFEFF/, ""));
  const header = records.shift();
  if (!header) invalidCsv("CSV 缺少表头。");
  const normalizedHeaders = header.values.map((value) => value.trim());
  if (
    normalizedHeaders.length !== contentImportHeaders.length ||
    normalizedHeaders.some(
      (value, index) => value !== contentImportHeaders[index],
    )
  ) {
    invalidCsv("CSV 表头与模板不一致，请重新下载模板后填写。");
  }
  if (records.length === 0 || records.length > 200) {
    invalidCsv("每个导入批次必须包含 1 至 200 行数据。");
  }
  return records.map((record) => {
    if (record.values.length !== contentImportHeaders.length) {
      invalidCsv(
        `第 ${record.line} 行有 ${record.values.length} 列，模板要求 ${contentImportHeaders.length} 列。`,
      );
    }
    return {
      rawData: Object.fromEntries(
        contentImportHeaders.map((headerName, index) => [
          headerName,
          record.values[index]?.trim() ?? "",
        ]),
      ),
      rowNumber: record.line,
    };
  });
}
