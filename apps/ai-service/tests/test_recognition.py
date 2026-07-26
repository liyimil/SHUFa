from io import BytesIO

import pytest
from PIL import Image

from calligraphy_ai.quality import InvalidImageError
from calligraphy_ai.recognition import recognize_glyph


def _to_png_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_recognition_returns_degraded_status() -> None:
    image = Image.new("L", (512, 512), 235)
    result = recognize_glyph(_to_png_bytes(image))

    assert result.status == "DEGRADED"
    assert result.model_version == "degraded-v1"
    assert result.candidates == []
    assert "not yet available" in result.degraded_reason


def test_recognition_handles_empty_image() -> None:
    image = Image.new("L", (256, 256), 255)
    result = recognize_glyph(_to_png_bytes(image))

    assert result.status == "DEGRADED"
    assert result.candidates == []


def test_recognition_handles_image_with_content() -> None:
    image = Image.new("L", (512, 512), 235)
    from PIL import ImageDraw

    draw = ImageDraw.Draw(image)
    draw.rectangle((200, 100, 312, 412), fill=15)

    result = recognize_glyph(_to_png_bytes(image))

    assert result.status == "DEGRADED"
    assert result.model_version == "degraded-v1"
    assert len(result.candidates) == 0


def test_recognition_rejects_invalid_image_bytes() -> None:
    with pytest.raises(InvalidImageError):
        recognize_glyph(b"not-an-image")
