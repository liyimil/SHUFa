from io import BytesIO

import pytest
from PIL import Image

from calligraphy_ai.component import analyze_components
from calligraphy_ai.quality import InvalidImageError


def _to_png_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_component_analysis_returns_unavailable_status() -> None:
    image = Image.new("L", (512, 512), 235)
    result = analyze_components(_to_png_bytes(image))

    assert result.status == "UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE"
    assert result.rule_version == "unvalidated"
    assert result.component_ratios == []
    assert result.main_direction is None
    assert "validated" in result.degraded_reason


def test_component_analysis_handles_empty_image() -> None:
    image = Image.new("L", (256, 256), 255)
    result = analyze_components(_to_png_bytes(image))

    assert result.status == "UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE"
    assert result.component_ratios == []
    assert result.main_direction is None


def test_component_analysis_handles_image_with_content() -> None:
    image = Image.new("L", (512, 512), 235)
    from PIL import ImageDraw

    draw = ImageDraw.Draw(image)
    draw.rectangle((200, 100, 312, 412), fill=15)

    result = analyze_components(_to_png_bytes(image))

    assert result.status == "UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE"
    assert result.rule_version == "unvalidated"
    assert len(result.component_ratios) == 0
    assert result.main_direction is None


def test_component_analysis_rejects_invalid_image_bytes() -> None:
    with pytest.raises(InvalidImageError):
        analyze_components(b"not-an-image")
