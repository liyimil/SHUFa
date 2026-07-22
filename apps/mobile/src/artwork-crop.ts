export interface ImageBounds {
  height: number;
  width: number;
}

export interface CropFrame {
  size: number;
  x: number;
  y: number;
}

export interface ContainedImageLayout {
  height: number;
  left: number;
  scale: number;
  top: number;
  width: number;
}

export interface PixelCropRect {
  height: number;
  originX: number;
  originY: number;
  width: number;
}

export type QuarterTurn = 0 | 90 | 180 | 270;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function validBounds(bounds: ImageBounds): boolean {
  return (
    Number.isFinite(bounds.width) &&
    bounds.width > 0 &&
    Number.isFinite(bounds.height) &&
    bounds.height > 0
  );
}

export function initialCropFrame(bounds: ImageBounds): CropFrame {
  if (!validBounds(bounds)) throw new Error("图片尺寸无效。");
  const size = Math.min(bounds.width, bounds.height);
  return {
    size,
    x: (bounds.width - size) / 2,
    y: (bounds.height - size) / 2,
  };
}

export function moveCropFrame(
  frame: CropFrame,
  deltaX: number,
  deltaY: number,
  bounds: ImageBounds,
): CropFrame {
  if (!validBounds(bounds)) return frame;
  return {
    ...frame,
    x: clamp(frame.x + deltaX, 0, Math.max(0, bounds.width - frame.size)),
    y: clamp(frame.y + deltaY, 0, Math.max(0, bounds.height - frame.size)),
  };
}

export function resizeCropFrame(
  frame: CropFrame,
  scaleFactor: number,
  bounds: ImageBounds,
): CropFrame {
  if (
    !validBounds(bounds) ||
    !Number.isFinite(scaleFactor) ||
    scaleFactor <= 0
  ) {
    return frame;
  }
  const maximum = Math.min(bounds.width, bounds.height);
  const minimum = Math.min(maximum, Math.max(256, maximum * 0.2));
  const size = clamp(frame.size * scaleFactor, minimum, maximum);
  const centerX = frame.x + frame.size / 2;
  const centerY = frame.y + frame.size / 2;
  return {
    size,
    x: clamp(centerX - size / 2, 0, Math.max(0, bounds.width - size)),
    y: clamp(centerY - size / 2, 0, Math.max(0, bounds.height - size)),
  };
}

export function containedImageLayout(
  image: ImageBounds,
  canvas: ImageBounds,
): ContainedImageLayout {
  if (!validBounds(image) || !validBounds(canvas)) {
    return { height: 0, left: 0, scale: 0, top: 0, width: 0 };
  }
  const scale = Math.min(
    canvas.width / image.width,
    canvas.height / image.height,
  );
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    height,
    left: (canvas.width - width) / 2,
    scale,
    top: (canvas.height - height) / 2,
    width,
  };
}

export function cropFrameToPixels(
  frame: CropFrame,
  bounds: ImageBounds,
): PixelCropRect {
  if (!validBounds(bounds)) throw new Error("图片尺寸无效。");
  const originX = Math.floor(clamp(frame.x, 0, bounds.width - 1));
  const originY = Math.floor(clamp(frame.y, 0, bounds.height - 1));
  const size = Math.max(
    1,
    Math.floor(
      Math.min(frame.size, bounds.width - originX, bounds.height - originY),
    ),
  );
  return { height: size, originX, originY, width: size };
}

export function turnQuarter(
  current: QuarterTurn,
  direction: -1 | 1,
): QuarterTurn {
  return ((current + direction * 90 + 360) % 360) as QuarterTurn;
}
