from io import BytesIO

from PIL import Image, ImageDraw

from calligraphy_ai.quality import analyze_image_bytes


def _to_png_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_clear_high_contrast_character_passes() -> None:
    image = Image.new("L", (512, 512), 235)
    draw = ImageDraw.Draw(image)
    draw.rectangle((220, 70, 292, 442), fill=15)
    draw.rectangle((100, 220, 412, 292), fill=15)

    result = analyze_image_bytes(_to_png_bytes(image))

    assert result.status == "PASS"
    assert result.metrics.width == 512
    assert result.metrics.height == 512
    assert result.metrics.ink_coverage > 0
    assert result.threshold_version == "quality-v1"


def test_small_blank_image_requires_retake() -> None:
    image = Image.new("L", (96, 96), 255)

    result = analyze_image_bytes(_to_png_bytes(image))
    finding_codes = {finding.code for finding in result.findings}

    assert result.status == "RETAKE"
    assert "RESOLUTION_TOO_LOW" in finding_codes
    assert "LOW_CONTRAST" in finding_codes
    assert "BLURRY" in finding_codes
