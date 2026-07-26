export interface ArtworkDraft {
  fileSize: number;
  height: number;
  mimeType: string | null;
  uploadRequestId: string;
  uri: string;
  width: number;
}

export interface ArtworkDraftInput {
  fileSize: number | null;
  height: number;
  mimeType: string | null;
  uploadRequestId: string;
  uri: string;
  width: number;
}

export interface ArtworkDraftStore {
  clear(): Promise<void>;
  copyImage(
    sourceUri: string,
    fileName: string,
  ): Promise<{ size: number; uri: string }>;
  deleteImage(uri: string): Promise<void>;
  getImageSize(uri: string): Promise<number | null>;
  isOwnedImage(uri: string): boolean;
  readMetadata(): Promise<string | null>;
  writeMetadata(value: string): Promise<void>;
}

interface ArtworkDraftMetadata extends ArtworkDraft {
  savedAt: string;
  status: "DRAFT" | "SUBMITTED";
  version: 1;
}

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function isFinitePositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

function isNullableMimeType(value: unknown): value is string | null {
  return (
    value === null || (typeof value === "string" && allowedMimeTypes.has(value))
  );
}

function parseMetadata(value: string): ArtworkDraftMetadata | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const metadata = parsed as Record<string, unknown>;
  if (
    metadata.version !== 1 ||
    (metadata.status !== "DRAFT" && metadata.status !== "SUBMITTED") ||
    typeof metadata.savedAt !== "string" ||
    !Number.isFinite(Date.parse(metadata.savedAt)) ||
    typeof metadata.uri !== "string" ||
    metadata.uri.length === 0 ||
    !isFinitePositiveInteger(metadata.fileSize) ||
    !isFinitePositiveInteger(metadata.height) ||
    !isFinitePositiveInteger(metadata.width) ||
    !isNullableMimeType(metadata.mimeType) ||
    typeof metadata.uploadRequestId !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(metadata.uploadRequestId)
  ) {
    return null;
  }
  return metadata as unknown as ArtworkDraftMetadata;
}

function extensionFor(input: ArtworkDraftInput): string {
  if (input.mimeType === "image/png") return "png";
  if (input.mimeType === "image/webp") return "webp";
  if (input.mimeType === "image/jpeg") return "jpg";
  const matched = input.uri.toLowerCase().match(/\.(png|webp|jpe?g)(?:[?#]|$)/);
  if (matched?.[1] === "png" || matched?.[1] === "webp") return matched[1];
  return "jpg";
}

function validateInput(input: ArtworkDraftInput): void {
  if (
    !input.uri ||
    !isFinitePositiveInteger(input.height) ||
    !isFinitePositiveInteger(input.width) ||
    (input.fileSize !== null && !isFinitePositiveInteger(input.fileSize)) ||
    !isNullableMimeType(input.mimeType) ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(input.uploadRequestId)
  ) {
    throw new Error("图片草稿元数据无效，请重新选择图片。");
  }
}

function toMetadata(
  draft: ArtworkDraft,
  status: ArtworkDraftMetadata["status"],
): ArtworkDraftMetadata {
  return {
    ...draft,
    savedAt: new Date().toISOString(),
    status,
    version: 1,
  };
}

export async function saveArtworkDraft(
  store: ArtworkDraftStore,
  input: ArtworkDraftInput,
): Promise<ArtworkDraft> {
  validateInput(input);
  const previousRaw = await store.readMetadata();
  const previous = previousRaw ? parseMetadata(previousRaw) : null;
  const fileName = `draft-${input.uploadRequestId}.${extensionFor(input)}`;
  const copied = await store.copyImage(input.uri, fileName);
  if (
    !isFinitePositiveInteger(copied.size) ||
    !store.isOwnedImage(copied.uri)
  ) {
    await store.deleteImage(copied.uri).catch(() => undefined);
    throw new Error("本地图片草稿为空或存储位置无效，请重新选择。");
  }
  const draft: ArtworkDraft = {
    fileSize: copied.size,
    height: input.height,
    mimeType: input.mimeType,
    uploadRequestId: input.uploadRequestId,
    uri: copied.uri,
    width: input.width,
  };
  try {
    await store.writeMetadata(JSON.stringify(toMetadata(draft, "DRAFT")));
  } catch (error: unknown) {
    await store.deleteImage(copied.uri).catch(() => undefined);
    throw error;
  }
  if (
    previous &&
    store.isOwnedImage(previous.uri) &&
    previous.uri !== copied.uri
  ) {
    await store.deleteImage(previous.uri).catch(() => undefined);
  }
  return draft;
}

export async function restoreArtworkDraft(
  store: ArtworkDraftStore,
): Promise<ArtworkDraft | null> {
  const raw = await store.readMetadata();
  if (raw === null) return null;
  const metadata = parseMetadata(raw);
  if (
    !metadata ||
    metadata.status === "SUBMITTED" ||
    !store.isOwnedImage(metadata.uri)
  ) {
    await store.clear();
    return null;
  }
  const actualSize = await store.getImageSize(metadata.uri);
  if (!actualSize || !isFinitePositiveInteger(actualSize)) {
    await store.clear();
    return null;
  }
  return {
    fileSize: actualSize,
    height: metadata.height,
    mimeType: metadata.mimeType,
    uploadRequestId: metadata.uploadRequestId,
    uri: metadata.uri,
    width: metadata.width,
  };
}

export async function updateArtworkDraft(
  store: ArtworkDraftStore,
  draft: ArtworkDraft,
): Promise<void> {
  validateInput(draft);
  if (!store.isOwnedImage(draft.uri)) {
    throw new Error("本地图片草稿存储位置无效。");
  }
  const size = await store.getImageSize(draft.uri);
  if (!size || !isFinitePositiveInteger(size)) {
    throw new Error("本地图片草稿已丢失。");
  }
  await store.writeMetadata(
    JSON.stringify(toMetadata({ ...draft, fileSize: size }, "DRAFT")),
  );
}

export async function markArtworkDraftSubmitted(
  store: ArtworkDraftStore,
  draft: ArtworkDraft,
): Promise<void> {
  validateInput(draft);
  if (!store.isOwnedImage(draft.uri)) return;
  await store.writeMetadata(JSON.stringify(toMetadata(draft, "SUBMITTED")));
}

export function clearArtworkDraft(store: ArtworkDraftStore): Promise<void> {
  return store.clear();
}
