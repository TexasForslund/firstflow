"""Säkerhetsgenomgången 2026-11-09: produktionsinställningar och för stora bilder."""

import io

import pytest
from PIL import Image
from pydantic import ValidationError

from app.core.config import Settings
from app.services import images

PRODUCTION = {
    "environment": "production",
    "session_cookie_secure": True,
    "frontend_url": "https://app.firstflow.se",
    "cors_origins": ["https://app.firstflow.se"],
}


def test_production_settings_ok() -> None:
    assert Settings(_env_file=None, **PRODUCTION).is_production


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("session_cookie_secure", False),
        ("frontend_url", "http://app.firstflow.se"),
        ("cors_origins", ["http://localhost:5173"]),
    ],
)
def test_production_refuses_unsafe_settings(field: str, value: object) -> None:
    with pytest.raises(ValidationError, match="produktion"):
        Settings(_env_file=None, **{**PRODUCTION, field: value})


def test_development_allows_defaults() -> None:
    assert not Settings(_env_file=None, environment="development").is_production


def test_too_many_pixels_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(images, "MAX_PIXELS", 100 * 100)
    out = io.BytesIO()
    Image.new("RGB", (101, 100)).save(out, "PNG")
    with pytest.raises(images.ImageError, match="för stor"):
        images.compress(out.getvalue())


def test_normal_image_still_works(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(images, "MAX_PIXELS", 100 * 100)
    out = io.BytesIO()
    Image.new("RGB", (100, 100)).save(out, "PNG")
    _, width, height = images.compress(out.getvalue())
    assert (width, height) == (100, 100)
