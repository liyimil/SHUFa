import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import type { PixelCropRect, QuarterTurn } from "./artwork-crop";

export interface CroppedArtworkImage {
  height: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  uri: string;
  width: number;
}

function outputFormat(mimeType: string | null): {
  format: SaveFormat;
  mimeType: CroppedArtworkImage["mimeType"];
} {
  if (mimeType === "image/png") {
    return { format: SaveFormat.PNG, mimeType: "image/png" };
  }
  if (mimeType === "image/webp") {
    return { format: SaveFormat.WEBP, mimeType: "image/webp" };
  }
  return { format: SaveFormat.JPEG, mimeType: "image/jpeg" };
}

export async function renderCroppedArtwork(
  sourceUri: string,
  sourceMimeType: string | null,
  crop: PixelCropRect,
  rotation: QuarterTurn,
): Promise<CroppedArtworkImage> {
  const output = outputFormat(sourceMimeType);
  const context = ImageManipulator.manipulate(sourceUri).crop(crop);
  if (rotation !== 0) context.rotate(rotation);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: 0.9,
    format: output.format,
  });
  return {
    height: saved.height,
    mimeType: output.mimeType,
    uri: saved.uri,
    width: saved.width,
  };
}

export function deleteTemporaryCroppedArtwork(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}
