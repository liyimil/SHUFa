from __future__ import annotations

from math import ceil, floor

import cv2
import numpy as np
from pydantic import BaseModel, ConfigDict

from calligraphy_ai.quality import InvalidImageError

ALGORITHM_VERSION = "opencv-dilate-contours-v1"
MAX_ANALYSIS_EDGE = 3000
MAX_CANDIDATES = 500


def _to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class SegmentationCandidate(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    bbox_x: int
    bbox_y: int
    bbox_width: int
    bbox_height: int
    confidence: int


class SourceSegmentationResult(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    algorithm_version: str = ALGORITHM_VERSION
    candidates: list[SegmentationCandidate]


def _intersection_over_union(
    first: tuple[int, int, int, int],
    second: tuple[int, int, int, int],
) -> float:
    first_x, first_y, first_width, first_height = first
    second_x, second_y, second_width, second_height = second
    left = max(first_x, second_x)
    top = max(first_y, second_y)
    right = min(first_x + first_width, second_x + second_width)
    bottom = min(first_y + first_height, second_y + second_height)
    intersection = max(0, right - left) * max(0, bottom - top)
    union = first_width * first_height + second_width * second_height - intersection
    return intersection / union if union > 0 else 0.0


def segment_source_bytes(image_bytes: bytes) -> SourceSegmentationResult:
    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_GRAYSCALE)
    if image is None or image.size == 0:
        raise InvalidImageError("无法解析原帖图片。")
    original_height, original_width = image.shape
    if original_width < 64 or original_height < 64:
        raise InvalidImageError("原帖图片尺寸过小，无法预切分。")

    scale = min(1.0, MAX_ANALYSIS_EDGE / max(original_width, original_height))
    if scale < 1.0:
        image = cv2.resize(
            image,
            (max(1, round(original_width * scale)), max(1, round(original_height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    analysis_height, analysis_width = image.shape
    blurred = cv2.GaussianBlur(image, (3, 3), 0)
    _, ink = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((2, 2), dtype=np.uint8))
    kernel = np.ones(
        (
            max(3, round(analysis_height * 0.006)),
            max(3, round(analysis_width * 0.006)),
        ),
        dtype=np.uint8,
    )
    grouped = cv2.dilate(ink, kernel, iterations=1)
    contours, _ = cv2.findContours(grouped, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    minimum_width = max(8, round(analysis_width * 0.012))
    minimum_height = max(8, round(analysis_height * 0.012))
    minimum_area = analysis_width * analysis_height * 0.00008
    padding = max(2, round(max(analysis_width, analysis_height) * 0.003))
    boxes: list[tuple[int, int, int, int, int]] = []
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        if (
            width < minimum_width
            or height < minimum_height
            or width * height < minimum_area
            or width > analysis_width * 0.8
            or height > analysis_height * 0.8
        ):
            continue
        aspect_ratio = width / height
        if aspect_ratio < 0.2 or aspect_ratio > 5:
            continue
        left = max(0, x - padding)
        top = max(0, y - padding)
        right = min(analysis_width, x + width + padding)
        bottom = min(analysis_height, y + height + padding)
        roi = ink[top:bottom, left:right]
        ink_density = float(cv2.countNonZero(roi)) / max(1, roi.size)
        squareness = min(width, height) / max(width, height)
        confidence = round(1000 * min(0.99, 0.35 + 0.35 * squareness + 0.3 * ink_density))
        mapped_left = floor(left / scale)
        mapped_top = floor(top / scale)
        mapped_right = min(original_width, ceil(right / scale))
        mapped_bottom = min(original_height, ceil(bottom / scale))
        candidate = (
            mapped_left,
            mapped_top,
            mapped_right - mapped_left,
            mapped_bottom - mapped_top,
            confidence,
        )
        if any(_intersection_over_union(candidate[:4], existing[:4]) > 0.75 for existing in boxes):
            continue
        boxes.append(candidate)

    boxes.sort(key=lambda box: (-(box[0] + box[2] / 2), box[1]))
    boxes = boxes[:MAX_CANDIDATES]
    return SourceSegmentationResult(
        candidates=[
            SegmentationCandidate(
                bbox_x=x,
                bbox_y=y,
                bbox_width=width,
                bbox_height=height,
                confidence=confidence,
            )
            for x, y, width, height, confidence in boxes
        ]
    )
