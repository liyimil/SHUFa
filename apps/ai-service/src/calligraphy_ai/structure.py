from __future__ import annotations

from typing import Literal

import cv2
import numpy as np
from pydantic import BaseModel, Field

from calligraphy_ai.quality import _decode_grayscale

NORMALIZATION_VERSION: Literal["glyph-normalization-v1"] = "glyph-normalization-v1"
MEASUREMENT_VERSION: Literal["structure-measurement-v2"] = "structure-measurement-v2"
RULE_VERSION: Literal["structure-v1"] = "structure-v1"
MODEL_VERSION: Literal["no-ml-geometry-v1"] = "no-ml-geometry-v1"
CANVAS_SIZE = 512

StructureAnomaly = Literal[
    "NO_FOREGROUND",
    "TOO_SPARSE",
    "TOO_DENSE",
    "TOUCHES_EDGE",
    "FRAGMENTED_FOREGROUND",
]


class NormalizationTransform(BaseModel):
    canvas_height: int = CANVAS_SIZE
    canvas_width: int = CANVAS_SIZE
    offset_x: int = Field(ge=0)
    offset_y: int = Field(ge=0)
    scale: float = Field(gt=0)
    source_height: int = Field(gt=0)
    source_width: int = Field(gt=0)
    version: Literal["glyph-normalization-v1"] = NORMALIZATION_VERSION


class SpatialDistribution(BaseModel):
    bottom_left: float = Field(ge=0, le=1)
    bottom_right: float = Field(ge=0, le=1)
    top_left: float = Field(ge=0, le=1)
    top_right: float = Field(ge=0, le=1)


class StructureMetrics(BaseModel):
    anomalies: list[StructureAnomaly]
    bbox_height_ratio: float = Field(ge=0, le=1)
    bbox_left_ratio: float = Field(ge=0, le=1)
    bbox_top_ratio: float = Field(ge=0, le=1)
    bbox_width_ratio: float = Field(ge=0, le=1)
    centroid_x: float = Field(ge=0, le=1)
    centroid_y: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    foreground_ratio: float = Field(ge=0, le=1)
    ink_aspect_ratio: float = Field(gt=0)
    normalization: NormalizationTransform
    spatial_distribution: SpatialDistribution


class GlyphNormalizationPreview(BaseModel):
    anomalies: list[StructureAnomaly]
    confidence: float = Field(ge=0, le=1)
    foreground_ratio: float = Field(ge=0, le=1)
    transform: NormalizationTransform


class StructureSuggestion(BaseModel):
    action: str
    code: Literal["CENTER_X", "CENTER_Y", "PROPORTION"]
    evidence: str
    phenomenon: str


class StructureComparison(BaseModel):
    advanced_analysis_status: Literal["UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE"] = (
        "UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE"
    )
    master: StructureMetrics
    measurement_version: Literal["structure-measurement-v2"] = MEASUREMENT_VERSION
    model_version: Literal["no-ml-geometry-v1"] = MODEL_VERSION
    normalization_version: Literal["glyph-normalization-v1"] = NORMALIZATION_VERSION
    status: Literal["OK", "LOW_CONFIDENCE"]
    suggestions: list[StructureSuggestion] = Field(max_length=3)
    threshold_version: Literal["structure-v1"] = RULE_VERSION
    user: StructureMetrics


def _normalize_grayscale(image_bytes: bytes) -> tuple[np.ndarray, NormalizationTransform]:
    grayscale = _decode_grayscale(image_bytes)
    source_height, source_width = grayscale.shape
    scale = min(CANVAS_SIZE / source_width, CANVAS_SIZE / source_height)
    target_width = max(1, min(CANVAS_SIZE, round(source_width * scale)))
    target_height = max(1, min(CANVAS_SIZE, round(source_height * scale)))
    interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
    resized = cv2.resize(grayscale, (target_width, target_height), interpolation=interpolation)
    offset_x = (CANVAS_SIZE - target_width) // 2
    offset_y = (CANVAS_SIZE - target_height) // 2
    canvas = np.full((CANVAS_SIZE, CANVAS_SIZE), 255, dtype=np.uint8)
    canvas[offset_y : offset_y + target_height, offset_x : offset_x + target_width] = resized
    return canvas, NormalizationTransform(
        offset_x=offset_x,
        offset_y=offset_y,
        scale=round(scale, 8),
        source_height=source_height,
        source_width=source_width,
    )


def _foreground_mask(grayscale: np.ndarray) -> np.ndarray:
    _, threshold = cv2.threshold(grayscale, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return threshold > 0


def _measurement_quality(mask: np.ndarray) -> tuple[list[StructureAnomaly], float, float]:
    foreground_count = int(mask.sum())
    foreground_ratio = foreground_count / mask.size
    if foreground_count < 10:
        return ["NO_FOREGROUND"], 0.0, round(foreground_ratio, 6)

    anomalies: list[StructureAnomaly] = []
    if foreground_ratio < 0.005:
        anomalies.append("TOO_SPARSE")
    if foreground_ratio > 0.7:
        anomalies.append("TOO_DENSE")
    edge_count = int(mask[0, :].sum() + mask[-1, :].sum() + mask[:, 0].sum() + mask[:, -1].sum())
    if edge_count / foreground_count > 0.01:
        anomalies.append("TOUCHES_EDGE")

    component_count, _, stats, _ = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8), connectivity=8
    )
    minimum_component = max(5, round(foreground_count * 0.001))
    meaningful_components = sum(
        1
        for index in range(1, component_count)
        if stats[index, cv2.CC_STAT_AREA] >= minimum_component
    )
    if meaningful_components > 12:
        anomalies.append("FRAGMENTED_FOREGROUND")

    penalties = {
        "TOO_SPARSE": 0.45,
        "TOO_DENSE": 0.45,
        "TOUCHES_EDGE": 0.25,
        "FRAGMENTED_FOREGROUND": 0.2,
    }
    confidence = max(0.0, 1.0 - sum(penalties[item] for item in anomalies))
    return anomalies, round(confidence, 4), round(foreground_ratio, 6)


def _spatial_distribution(mask: np.ndarray, foreground_count: int) -> SpatialDistribution:
    midpoint_y = mask.shape[0] // 2
    midpoint_x = mask.shape[1] // 2

    def share(region: np.ndarray) -> float:
        return round(float(region.sum()) / foreground_count, 4)

    return SpatialDistribution(
        bottom_left=share(mask[midpoint_y:, :midpoint_x]),
        bottom_right=share(mask[midpoint_y:, midpoint_x:]),
        top_left=share(mask[:midpoint_y, :midpoint_x]),
        top_right=share(mask[:midpoint_y, midpoint_x:]),
    )


def measure_structure(image_bytes: bytes) -> StructureMetrics:
    grayscale, transform = _normalize_grayscale(image_bytes)
    mask = _foreground_mask(grayscale)
    ys, xs = np.where(mask)
    anomalies, confidence, foreground_ratio = _measurement_quality(mask)
    height, width = grayscale.shape
    if len(xs) < 10:
        return StructureMetrics(
            anomalies=anomalies,
            bbox_height_ratio=0,
            bbox_left_ratio=0.5,
            bbox_top_ratio=0.5,
            bbox_width_ratio=0,
            centroid_x=0.5,
            centroid_y=0.5,
            confidence=confidence,
            foreground_ratio=foreground_ratio,
            ink_aspect_ratio=1,
            normalization=transform,
            spatial_distribution=SpatialDistribution(
                bottom_left=0,
                bottom_right=0,
                top_left=0,
                top_right=0,
            ),
        )
    bbox_width = int(xs.max() - xs.min() + 1)
    bbox_height = int(ys.max() - ys.min() + 1)
    return StructureMetrics(
        anomalies=anomalies,
        bbox_height_ratio=round(bbox_height / height, 4),
        bbox_left_ratio=round(float(xs.min()) / width, 4),
        bbox_top_ratio=round(float(ys.min()) / height, 4),
        bbox_width_ratio=round(bbox_width / width, 4),
        centroid_x=round(float(xs.mean()) / max(1, width - 1), 4),
        centroid_y=round(float(ys.mean()) / max(1, height - 1), 4),
        confidence=confidence,
        foreground_ratio=foreground_ratio,
        ink_aspect_ratio=round(bbox_width / bbox_height, 4),
        normalization=transform,
        spatial_distribution=_spatial_distribution(mask, len(xs)),
    )


def normalization_preview(image_bytes: bytes) -> GlyphNormalizationPreview:
    grayscale, transform = _normalize_grayscale(image_bytes)
    anomalies, confidence, foreground_ratio = _measurement_quality(_foreground_mask(grayscale))
    return GlyphNormalizationPreview(
        anomalies=anomalies,
        confidence=confidence,
        foreground_ratio=foreground_ratio,
        transform=transform,
    )


def compare_structure(user_bytes: bytes, master_bytes: bytes) -> StructureComparison:
    user = measure_structure(user_bytes)
    master = measure_structure(master_bytes)
    suggestions: list[StructureSuggestion] = []
    status: Literal["OK", "LOW_CONFIDENCE"] = (
        "OK" if min(user.confidence, master.confidence) >= 0.5 else "LOW_CONFIDENCE"
    )

    if status == "OK":
        delta_x = user.centroid_x - master.centroid_x
        if abs(delta_x) >= 0.04:
            direction = "偏右" if delta_x > 0 else "偏左"
            action = (
                "下一遍把主要笔画整体向左收一点。"
                if delta_x > 0
                else "下一遍把主要笔画整体向右移一点。"
            )
            suggestions.append(
                StructureSuggestion(
                    action=action,
                    code="CENTER_X",
                    evidence=(
                        f"你的墨迹重心横坐标为 {user.centroid_x:.2f}，"
                        f"范字为 {master.centroid_x:.2f}。"
                    ),
                    phenomenon=f"整体重心相对范字{direction}。",
                )
            )

        delta_y = user.centroid_y - master.centroid_y
        if abs(delta_y) >= 0.04:
            direction = "偏下" if delta_y > 0 else "偏上"
            action = "下一遍适当抬高下部笔画。" if delta_y > 0 else "下一遍让下部笔画更舒展。"
            suggestions.append(
                StructureSuggestion(
                    action=action,
                    code="CENTER_Y",
                    evidence=(
                        f"你的墨迹重心纵坐标为 {user.centroid_y:.2f}，"
                        f"范字为 {master.centroid_y:.2f}。"
                    ),
                    phenomenon=f"整体重心相对范字{direction}。",
                )
            )

        ratio_delta = user.ink_aspect_ratio / master.ink_aspect_ratio - 1
        if abs(ratio_delta) >= 0.12:
            wider = ratio_delta > 0
            suggestions.append(
                StructureSuggestion(
                    action=(
                        "下一遍收紧横向间距，保留纵向伸展。"
                        if wider
                        else "下一遍适当放开横向笔画。"
                    ),
                    code="PROPORTION",
                    evidence=(
                        f"你的墨迹宽高比为 {user.ink_aspect_ratio:.2f}，"
                        f"范字为 {master.ink_aspect_ratio:.2f}。"
                    ),
                    phenomenon="整体比例相对范字偏宽。" if wider else "整体比例相对范字偏窄。",
                )
            )

    return StructureComparison(
        user=user,
        master=master,
        status=status,
        suggestions=suggestions[:3],
    )
