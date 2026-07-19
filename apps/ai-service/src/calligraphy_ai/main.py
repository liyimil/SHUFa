from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from calligraphy_ai.crop import crop_glyph_bytes
from calligraphy_ai.quality import ImageQualityResult, InvalidImageError, analyze_image_bytes
from calligraphy_ai.segmentation import SourceSegmentationResult, segment_source_bytes
from calligraphy_ai.structure import (
    GlyphNormalizationPreview,
    StructureComparison,
    compare_structure,
    normalization_preview,
)


class HealthResponse(BaseModel):
    service: Literal["ai-service"] = "ai-service"
    status: Literal["ok"] = "ok"
    timestamp: datetime


app = FastAPI(
    title="AI 辅助书法学习推理服务",
    description="图片质量、单字识别和结构分析的内部服务边界",
    version="0.1.0",
)


@app.get("/health", response_model=HealthResponse, tags=["system"])
def get_health() -> HealthResponse:
    return HealthResponse(status="ok", timestamp=datetime.now(UTC))


@app.post("/v1/image-quality", response_model=ImageQualityResult, tags=["analysis"])
async def analyze_image_quality(file: Annotated[UploadFile, File()]) -> ImageQualityResult:
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(
            status_code=415,
            detail={
                "code": "UNSUPPORTED_IMAGE_TYPE",
                "message": "仅支持 JPEG、PNG 或 WebP 图片。",
            },
        )

    image_bytes = await file.read(10 * 1024 * 1024 + 1)
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail={"code": "IMAGE_TOO_LARGE", "message": "图片不能超过 10 MB。"},
        )

    try:
        return analyze_image_bytes(image_bytes)
    except InvalidImageError as error:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_IMAGE", "message": str(error)},
        ) from error


@app.post("/v1/glyph-crop", tags=["content"])
async def crop_glyph(
    file: Annotated[UploadFile, File()],
    bbox_x: Annotated[int, Form(ge=0)],
    bbox_y: Annotated[int, Form(ge=0)],
    bbox_width: Annotated[int, Form(gt=0)],
    bbox_height: Annotated[int, Form(gt=0)],
) -> Response:
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_IMAGE_TYPE"})
    image_bytes = await file.read(50 * 1024 * 1024 + 1)
    if len(image_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail={"code": "IMAGE_TOO_LARGE"})
    try:
        content, width, height, checksum = crop_glyph_bytes(
            image_bytes, bbox_x, bbox_y, bbox_width, bbox_height
        )
    except InvalidImageError as error:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_CROP", "message": str(error)},
        ) from error
    return Response(
        content=content,
        media_type="image/webp",
        headers={
            "X-Image-Width": str(width),
            "X-Image-Height": str(height),
            "X-Content-SHA256": checksum,
        },
    )


@app.post(
    "/v1/source-segmentation",
    response_model=SourceSegmentationResult,
    response_model_by_alias=True,
    tags=["content"],
)
async def segment_source(file: Annotated[UploadFile, File()]) -> SourceSegmentationResult:
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_IMAGE_TYPE"})
    image_bytes = await file.read(50 * 1024 * 1024 + 1)
    if len(image_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail={"code": "IMAGE_TOO_LARGE"})
    try:
        return segment_source_bytes(image_bytes)
    except InvalidImageError as error:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_SEGMENTATION_IMAGE", "message": str(error)},
        ) from error


@app.post("/v1/structure-comparison", response_model=StructureComparison, tags=["analysis"])
async def compare_glyph_structure(
    user_file: Annotated[UploadFile, File()],
    master_file: Annotated[UploadFile, File()],
) -> StructureComparison:
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if user_file.content_type not in allowed_types or master_file.content_type not in allowed_types:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_IMAGE_TYPE"})
    user_bytes = await user_file.read(10 * 1024 * 1024 + 1)
    master_bytes = await master_file.read(10 * 1024 * 1024 + 1)
    if max(len(user_bytes), len(master_bytes)) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail={"code": "IMAGE_TOO_LARGE"})
    try:
        return compare_structure(user_bytes, master_bytes)
    except InvalidImageError as error:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_COMPARISON_IMAGE", "message": str(error)},
        ) from error


@app.post(
    "/v1/glyph-normalization",
    response_model=GlyphNormalizationPreview,
    tags=["analysis"],
)
async def preview_glyph_normalization(
    file: Annotated[UploadFile, File()],
) -> GlyphNormalizationPreview:
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_IMAGE_TYPE"})
    image_bytes = await file.read(10 * 1024 * 1024 + 1)
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail={"code": "IMAGE_TOO_LARGE"})
    try:
        return normalization_preview(image_bytes)
    except InvalidImageError as error:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_NORMALIZATION_IMAGE", "message": str(error)},
        ) from error
