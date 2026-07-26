from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from calligraphy_ai.quality import validate_image_bytes


class ComponentRatio(BaseModel):
    """Placeholder for per-component ratio data.

    When validated character rules are available, this will contain
    the ratio of each character component (e.g., left/right, top/bottom).
    """


class MainDirection(BaseModel):
    """Placeholder for main stroke direction data.

    When validated character rules are available, this will contain
    the dominant stroke direction (horizontal, vertical, etc.).
    """


class ComponentAnalysisResult(BaseModel):
    """Degraded component analysis result.

    Always returns UNAVAILABLE status because no validated per-character
    component annotation rules exist yet. This allows the API to handle
    the response gracefully and abstain from generating fake conclusions.
    """

    status: Literal["UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE"] = (
        "UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE"
    )
    component_ratios: list[ComponentRatio] = Field(default_factory=list)
    main_direction: MainDirection | None = None
    rule_version: Literal["unvalidated"] = "unvalidated"
    degraded_reason: str = (
        "Component ratio and main direction analysis requires "
        "validated per-character annotation rules from a calligraphy expert. "
        "These rules are not yet available."
    )


def analyze_components(image_bytes: bytes) -> ComponentAnalysisResult:
    """Degraded component analysis.

    Returns a structured UNAVAILABLE response indicating that validated
    per-character annotation rules are not yet available. This allows the
    API to handle the response gracefully and abstain from fake conclusions.
    """
    validate_image_bytes(image_bytes)
    return ComponentAnalysisResult()
