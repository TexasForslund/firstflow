"""Frågor där eleven skickar bilder (idé 12, Texas 2026-11-07).

Bilderna görs mindre och sparas som WebP utan platsdata, eftersom de oftast tas med mobilen.
"""

import io
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.report import FormVersion, ReportImage
from app.models.school import School
from app.models.school_class import class_students
from tests.test_reports import World, frozen_time, q, start  # noqa: F401

Login = Callable[..., None]


def jpeg(width: int, height: int, *, gps: bool = False) -> bytes:
    image = Image.new("RGB", (width, height), (200, 120, 40))
    exif = Image.Exif()
    if gps:
        exif[0x8825] = {2: (63.0, 49.0, 0.0)}  # GPSInfo, latitud
    exif[0x0112] = 6  # Orientation: vriden 90°, som många mobilbilder
    out = io.BytesIO()
    image.save(out, "JPEG", exif=exif)
    return out.getvalue()


@pytest.fixture
def w(
    client: TestClient,
    db: Session,
    make_school: Callable[..., School],
    make_user: Callable[..., Any],
    login: Login,
) -> World:
    world = World(db, make_school, make_user)
    world.photos = q("images", "Visa vad du har gjort", max_images=2)
    world.summary = q("long_text", "Vad har du gjort?", required=False)
    world.questions = [world.photos, world.summary]
    login(world.teacher)
    url = f"/api/classes/{world.ee22.id}/form"
    assert client.put(url, json={"questions": world.questions}).status_code == 200
    assert client.post(f"{url}/publish").status_code == 200
    client.post("/api/auth/logout")
    long_ago = datetime(2026, 8, 1, tzinfo=UTC)
    db.execute(update(FormVersion).values(published_at=long_ago))
    db.execute(update(class_students).values(created_at=long_ago))
    db.flush()
    return world


def upload(client: TestClient, report: dict, w: World, data: bytes) -> Any:
    return client.post(
        f"/api/reports/{report['id']}/images",
        data={"question_id": w.photos["id"]},
        files={"file": ("IMG_0001.jpg", data, "image/jpeg")},
    )


def test_image_is_compressed_to_webp_without_location(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    login(w.student)
    report = start(client, w)
    response = upload(client, report, w, jpeg(4000, 3000, gps=True))
    assert response.status_code == 201, response.text
    image = response.json()
    # Längsta sidan 1600 px, och vriden enligt EXIF: 3000×4000 blir 1200×1600.
    assert (image["width"], image["height"]) == (1200, 1600)

    got = client.get(f"/api/reports/{report['id']}/images/{image['id']}")
    assert got.headers["content-type"] == "image/webp"
    with Image.open(io.BytesIO(got.content)) as webp:
        assert webp.format == "WEBP"
        assert webp.size == (1200, 1600)
        assert not webp.getexif()


def test_answer_with_images_and_submit(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    login(w.student)
    report = start(client, w)
    url = f"/api/reports/{report['id']}"
    a, b = (upload(client, report, w, jpeg(800, 600)).json()["id"] for _ in range(2))
    assert upload(client, report, w, jpeg(800, 600)).status_code == 422  # högst två

    # Svaret pekar på bilderna i ordning.
    saved = client.put(f"{url}/answers/{w.photos['id']}", json={"image_ids": [b, a]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["answers"][0]["image_ids"] == [b, a]
    # En bild som inte hör till redovisningen går inte att använda.
    other = "00000000-0000-4000-8000-000000000009"
    bad = client.put(f"{url}/answers/{w.photos['id']}", json={"image_ids": [other]})
    assert bad.status_code == 422

    # Tas en bild bort försvinner den ur svaret, och en ny kan laddas upp.
    assert client.delete(f"{url}/images/{a}").status_code == 204
    detail = client.get(url).json()
    assert detail["answers"][0]["image_ids"] == [b]
    c = upload(client, report, w, jpeg(800, 600)).json()["id"]

    # Bilden c finns inte i svaret och tas bort när redovisningen skickas in.
    assert client.post(f"{url}/submit").status_code == 200
    kept = set(db.scalars(select(ReportImage.id).where(ReportImage.report_id == report["id"])))
    assert {str(i) for i in kept} == {b}
    assert c not in {str(i) for i in kept}

    # Läraren ser bilden, en annan elev gör det inte.
    client.post("/api/auth/logout")
    login(w.teacher)
    assert client.get(f"{url}/images/{b}").status_code == 200
    client.post("/api/auth/logout")
    login(w.other_student)
    assert client.get(f"{url}/images/{b}").status_code == 404


def test_required_images_and_bad_files(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    url = f"/api/reports/{report['id']}"
    response = client.post(f"{url}/submit")
    assert response.status_code == 422
    assert "Visa vad du har gjort" in response.json()["detail"]

    not_image = upload(client, report, w, b"inte en bild")
    assert not_image.status_code == 422
    assert "gick inte att läsa" in not_image.json()["detail"]

    # Bilder går bara till en bildfråga.
    wrong = client.post(
        f"{url}/images",
        data={"question_id": w.summary["id"]},
        files={"file": ("a.jpg", jpeg(10, 10), "image/jpeg")},
    )
    assert wrong.status_code == 404
