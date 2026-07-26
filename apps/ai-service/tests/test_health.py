import json
import logging
import re

import pytest
from fastapi.testclient import TestClient

from calligraphy_ai.main import HTTP_LOGGER, app


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


@pytest.mark.parametrize(
    ("path", "error_code"),
    [
        ("/v1/glyph-recognition", "INVALID_RECOGNITION_IMAGE"),
        ("/v1/component-analysis", "INVALID_COMPONENT_IMAGE"),
    ],
)
def test_degraded_analysis_endpoints_reject_invalid_image_bytes(
    path: str,
    error_code: str,
) -> None:
    response = TestClient(app).post(
        path,
        files={"file": ("invalid.png", b"not-an-image", "image/png")},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == error_code


def test_request_id_is_validated_echoed_and_logged_without_query() -> None:
    messages: list[str] = []

    class MemoryHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            messages.append(record.getMessage())

    handler = MemoryHandler()
    HTTP_LOGGER.addHandler(handler)
    try:
        response = TestClient(app).get(
            "/health?token=must-not-be-logged",
            headers={"X-Request-Id": "analysis-4b02e7dd"},
        )
    finally:
        HTTP_LOGGER.removeHandler(handler)

    assert response.headers["x-request-id"] == "analysis-4b02e7dd"
    log_entries = [
        json.loads(line)
        for line in messages
        if line.startswith("{") and '"event":"ai_http_request_completed"' in line
    ]
    assert log_entries[-1] == {
        "durationMs": log_entries[-1]["durationMs"],
        "event": "ai_http_request_completed",
        "method": "GET",
        "path": "/health",
        "requestId": "analysis-4b02e7dd",
        "statusCode": 200,
    }

    invalid = TestClient(app).get(
        "/health",
        headers={"X-Request-Id": "users/private.jpg?token=secret"},
    )
    assert invalid.headers["x-request-id"] != "users/private.jpg?token=secret"
    assert re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
        invalid.headers["x-request-id"],
    )
