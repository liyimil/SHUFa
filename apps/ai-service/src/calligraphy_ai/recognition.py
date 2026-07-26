from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from calligraphy_ai.quality import validate_image_bytes


class RecognitionCandidate(BaseModel):
    character: str
    confidence: float = Field(ge=0, le=1)


class RecognitionResult(BaseModel):
    candidates: list[RecognitionCandidate]
    model_version: Literal["degraded-v1"] = "degraded-v1"
    status: Literal["DEGRADED"] = "DEGRADED"
    degraded_reason: str = "Character recognition model is not yet available."


def recognize_glyph(image_bytes: bytes) -> RecognitionResult:
    """Degraded recognition endpoint.

    Returns a structured DEGRADED response indicating that the ML model
    is not yet available. This allows the API to handle the response
    gracefully and provide feedback to the user.
    """
    validate_image_bytes(image_bytes)
    return RecognitionResult(
        candidates=[],
        degraded_reason="Character recognition model is not yet available.",
    )
