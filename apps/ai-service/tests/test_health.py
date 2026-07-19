from fastapi.testclient import TestClient

from calligraphy_ai.main import app


def test_health() -> None:
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json()["service"] == "ai-service"
    assert response.json()["status"] == "ok"
    assert response.json()["timestamp"]


def test_quality_endpoint_rejects_non_image_content() -> None:
    response = TestClient(app).post(
        "/v1/image-quality",
        files={"file": ("notes.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 415
    assert response.json()["detail"]["code"] == "UNSUPPORTED_IMAGE_TYPE"
