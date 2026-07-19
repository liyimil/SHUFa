from __future__ import annotations

from io import BytesIO
from typing import Literal

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

Image.MAX_IMAGE_PIXELS = 40_000_000

MIN_DIMENSION = 256
MIN_CONTRAST = 22.0
MIN_BLUR_SCORE = 45.0
MIN_BRIGHTNESS = 45.0
MAX_BRIGHTNESS = 245.0
MAX_EDGE_INK_RATIO = 0.025


class InvalidImageError(ValueError):
    """Raised when uploaded bytes cannot be handled as a safe raster image."""


class QualityMetrics(BaseModel):
    blur_score: float = Field(ge=0)
    brightness: float = Field(ge=0, le=255)
    contrast: float = Field(ge=0)
    edge_ink_ratio: float = Field(ge=0, le=1)
    height: int = Field(gt=0)
    ink_coverage: float = Field(ge=0, le=1)
    width: int = Field(gt=0)


class QualityFinding(BaseModel):
    code: Literal[
        "BLURRY",
        "INK_TOUCHES_BORDER",
        "LOW_CONTRAST",
        "RESOLUTION_TOO_LOW",
        "TOO_BRIGHT",
        "TOO_DARK",
    ]
    message: str
    severity: Literal["warning", "error"]


class ImageQualityResult(BaseModel):
    findings: list[QualityFinding]
    metrics: QualityMetrics
    status: Literal["PASS", "RETAKE"]
    threshold_version: Literal["quality-v1"] = "quality-v1"


def _decode_grayscale(image_bytes: bytes) -> np.ndarray:
    if not image_bytes:
        raise InvalidImageError("图片内容为空。")

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.load()
            if image.width * image.height > Image.MAX_IMAGE_PIXELS:
                raise InvalidImageError("图片像素尺寸过大。")
            grayscale = np.asarray(image.convert("L"), dtype=np.uint8)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise InvalidImageError("图片像素尺寸过大。") from error
    except (OSError, UnidentifiedImageError) as error:
        raise InvalidImageError("无法解析图片，请重新拍摄或选择其他图片。") from error

    if grayscale.ndim != 2 or grayscale.size == 0:
        raise InvalidImageError("图片没有可分析的像素。")

    return grayscale


def _edge_ink_ratio(ink_mask: np.ndarray) -> float:
    border_width = max(1, min(ink_mask.shape) // 50)
    border = np.concatenate(
        [
            ink_mask[:border_width, :].ravel(),
            ink_mask[-border_width:, :].ravel(),
            ink_mask[:, :border_width].ravel(),
            ink_mask[:, -border_width:].ravel(),
        ]
    )
    return float(np.mean(border))


def analyze_image_bytes(image_bytes: bytes) -> ImageQualityResult:
    grayscale = _decode_grayscale(image_bytes)
    height, width = grayscale.shape
    brightness = float(np.mean(grayscale))
    contrast = float(np.std(grayscale))
    blur_score = float(cv2.Laplacian(grayscale, cv2.CV_64F).var())

    # Otsu threshold adapts to white paper, cream paper and moderate lighting differences.
    _, threshold = cv2.threshold(grayscale, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink_mask = threshold > 0
    ink_coverage = float(np.mean(ink_mask))
    edge_ink_ratio = _edge_ink_ratio(ink_mask)

    findings: list[QualityFinding] = []

    if min(width, height) < MIN_DIMENSION:
        findings.append(
            QualityFinding(
                code="RESOLUTION_TOO_LOW",
                message="单字区域太小，请靠近作品重新拍摄。",
                severity="error",
            )
        )
    if brightness < MIN_BRIGHTNESS:
        findings.append(
            QualityFinding(code="TOO_DARK", message="画面太暗，请增加均匀光线。", severity="error")
        )
    elif brightness > MAX_BRIGHTNESS:
        findings.append(
            QualityFinding(
                code="TOO_BRIGHT",
                message="画面过亮，纸面细节可能丢失，请避免强光或反光。",
                severity="warning",
            )
        )
    if contrast < MIN_CONTRAST:
        findings.append(
            QualityFinding(
                code="LOW_CONTRAST",
                message="字迹与纸面的对比不足，请调整光线或重新对焦。",
                severity="error",
            )
        )
    if blur_score < MIN_BLUR_SCORE:
        findings.append(
            QualityFinding(
                code="BLURRY",
                message="图片可能失焦，请保持手机稳定。",
                severity="error",
            )
        )
    if edge_ink_ratio > MAX_EDGE_INK_RATIO:
        findings.append(
            QualityFinding(
                code="INK_TOUCHES_BORDER",
                message="字迹贴近裁切边缘，请保留少量纸面空白。",
                severity="warning",
            )
        )

    status: Literal["PASS", "RETAKE"] = (
        "RETAKE" if any(finding.severity == "error" for finding in findings) else "PASS"
    )

    return ImageQualityResult(
        findings=findings,
        metrics=QualityMetrics(
            blur_score=round(blur_score, 3),
            brightness=round(brightness, 3),
            contrast=round(contrast, 3),
            edge_ink_ratio=round(edge_ink_ratio, 6),
            height=height,
            ink_coverage=round(ink_coverage, 6),
            width=width,
        ),
        status=status,
    )
