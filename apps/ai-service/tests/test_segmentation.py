from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from calligraphy_ai.main import app
from calligraphy_ai.segmentation import ALGORITHM_VERSION, segment_source_bytes


def _source_page() -> bytes:
    image = Image.new("RGB", (500, 600), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((330, 80, 410, 180), fill="black")
    draw.rectangle((330, 300, 410, 410), fill="black")
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_segments_separate_ink_regions_in_stable_reading_order() -> None:
    result = segment_source_bytes(_source_page())

    assert result.algorithm_version == ALGORITHM_VERSION
    assert len(result.candidates) == 2
    assert result.candidates[0].bbox_y < result.candidates[1].bbox_y
    assert all(0 <= candidate.confidence <= 1000 for candidate in result.candidates)


def test_exposes_camel_case_versioned_segmentation_contract() -> None:
    client = TestClient(app)
    response = client.post(
        "/v1/source-segmentation",
        files={"file": ("source.png", _source_page(), "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["algorithmVersion"] == ALGORITHM_VERSION
    assert set(body["candidates"][0]) == {
        "bboxHeight",
        "bboxWidth",
        "bboxX",
        "bboxY",
        "confidence",
    }
