from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from calligraphy_ai.main import app
from calligraphy_ai.structure import compare_structure, normalization_preview


def _image_with_block_size(
    size: tuple[int, int], box: tuple[int, int, int, int]
) -> bytes:
    image = Image.new("L", size, "white")
    ImageDraw.Draw(image).rectangle(box, fill="black")
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _image_with_block(box: tuple[int, int, int, int]) -> bytes:
    return _image_with_block_size((500, 500), box)


def test_comparison_explains_horizontal_center_difference() -> None:
    master = _image_with_block((150, 100, 350, 400))
    shifted_user = _image_with_block((250, 100, 450, 400))

    result = compare_structure(shifted_user, master)

    assert result.threshold_version == "structure-v1"
    assert result.measurement_version == "structure-measurement-v2"
    assert result.model_version == "no-ml-geometry-v1"
    assert result.master.bbox_left_ratio == 0.3008
    assert result.master.bbox_top_ratio == 0.1992
    assert result.master.bbox_width_ratio == 0.4004
    assert result.master.bbox_height_ratio == 0.6035
    assert result.master.confidence == 1
    assert result.master.spatial_distribution.top_left == 0.248
    assert result.status == "OK"
    assert result.suggestions[0].code == "CENTER_X"
    assert "偏右" in result.suggestions[0].phenomenon
    assert len(result.suggestions) <= 3


def test_normalization_preserves_aspect_and_reports_transform() -> None:
    preview = normalization_preview(
        _image_with_block_size((400, 200), (100, 50, 300, 150))
    )

    assert preview.transform.version == "glyph-normalization-v1"
    assert preview.transform.source_width == 400
    assert preview.transform.source_height == 200
    assert preview.transform.canvas_width == 512
    assert preview.transform.scale == 1.28
    assert preview.transform.offset_x == 0
    assert preview.transform.offset_y == 128
    assert preview.confidence == 1


def test_fixed_input_is_exactly_reproducible() -> None:
    master = _image_with_block((150, 100, 350, 400))
    user = _image_with_block((250, 100, 450, 400))

    assert compare_structure(user, master).model_dump() == compare_structure(
        user, master
    ).model_dump()


def test_low_confidence_abstains_from_advice() -> None:
    almost_empty = _image_with_block((0, 0, 0, 0))
    master = _image_with_block((150, 100, 350, 400))

    result = compare_structure(almost_empty, master)

    assert result.status == "LOW_CONFIDENCE"
    assert result.user.anomalies == ["NO_FOREGROUND"]
    assert result.user.confidence == 0
    assert result.suggestions == []
    assert (
        result.advanced_analysis_status
        == "UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE"
    )


def test_normalization_endpoint_returns_parameters_without_an_image_copy() -> None:
    response = TestClient(app).post(
        "/v1/glyph-normalization",
        files={
            "file": (
                "glyph.png",
                _image_with_block_size((400, 200), (100, 50, 300, 150)),
                "image/png",
            )
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["transform"]["offset_y"] == 128
    assert payload["transform"]["version"] == "glyph-normalization-v1"
    assert "image" not in payload
