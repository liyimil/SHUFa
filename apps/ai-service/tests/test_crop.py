from io import BytesIO

from PIL import Image

from calligraphy_ai.crop import crop_glyph_bytes


def test_crops_a_glyph_to_webp_with_checksum() -> None:
    source = BytesIO()
    Image.new("RGB", (800, 600), "white").save(source, format="PNG")

    content, width, height, checksum = crop_glyph_bytes(source.getvalue(), 100, 50, 300, 400)

    with Image.open(BytesIO(content)) as result:
        assert result.format == "WEBP"
        assert result.size == (300, 400)
    assert width == 300
    assert height == 400
    assert len(checksum) == 64
