export interface ComparisonTransform {
  rotation: number;
  scale: number;
  translateX: number;
  translateY: number;
}

export interface TouchPoint {
  x: number;
  y: number;
}

export interface GestureSnapshot {
  angle: number;
  center: TouchPoint;
  distance: number;
  touchCount: 1 | 2;
  transform: ComparisonTransform;
}

export const defaultComparisonTransform: ComparisonTransform = {
  rotation: 0,
  scale: 1,
  translateX: 0,
  translateY: 0,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function center(points: TouchPoint[]): TouchPoint {
  const relevant = points.slice(0, 2);
  return {
    x: relevant.reduce((sum, point) => sum + point.x, 0) / relevant.length,
    y: relevant.reduce((sum, point) => sum + point.y, 0) / relevant.length,
  };
}

function distance(points: TouchPoint[]): number {
  if (points.length < 2) return 0;
  return Math.hypot(
    (points[1]?.x ?? 0) - (points[0]?.x ?? 0),
    (points[1]?.y ?? 0) - (points[0]?.y ?? 0),
  );
}

function angle(points: TouchPoint[]): number {
  if (points.length < 2) return 0;
  return (
    (Math.atan2(
      (points[1]?.y ?? 0) - (points[0]?.y ?? 0),
      (points[1]?.x ?? 0) - (points[0]?.x ?? 0),
    ) *
      180) /
    Math.PI
  );
}

function normalizeRotation(rotation: number): number {
  return ((((rotation + 180) % 360) + 360) % 360) - 180;
}

export function beginComparisonGesture(
  transform: ComparisonTransform,
  touches: TouchPoint[],
): GestureSnapshot | null {
  if (touches.length === 0) return null;
  const touchCount = touches.length >= 2 ? 2 : 1;
  return {
    angle: angle(touches),
    center: center(touches),
    distance: distance(touches),
    touchCount,
    transform: { ...transform },
  };
}

export function updateComparisonGesture(
  snapshot: GestureSnapshot,
  touches: TouchPoint[],
  maximumTranslation = 240,
): ComparisonTransform | null {
  const touchCount = touches.length >= 2 ? 2 : touches.length === 1 ? 1 : 0;
  if (touchCount === 0 || touchCount !== snapshot.touchCount) return null;
  const currentCenter = center(touches);
  const next: ComparisonTransform = {
    ...snapshot.transform,
    translateX: clamp(
      snapshot.transform.translateX + currentCenter.x - snapshot.center.x,
      -maximumTranslation,
      maximumTranslation,
    ),
    translateY: clamp(
      snapshot.transform.translateY + currentCenter.y - snapshot.center.y,
      -maximumTranslation,
      maximumTranslation,
    ),
  };
  if (touchCount === 2 && snapshot.distance > 0) {
    next.scale = clamp(
      snapshot.transform.scale * (distance(touches) / snapshot.distance),
      0.5,
      3,
    );
    next.rotation = normalizeRotation(
      snapshot.transform.rotation + angle(touches) - snapshot.angle,
    );
  }
  return next;
}

export function adjustComparisonScale(value: number, delta: number): number {
  return clamp(Math.round((value + delta) * 100) / 100, 0.5, 3);
}

export function adjustComparisonRotation(value: number, delta: number): number {
  return normalizeRotation(value + delta);
}
