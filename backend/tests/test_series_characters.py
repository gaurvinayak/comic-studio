"""
Phase 1 integration tests for series + character flows.

The AI calls (LLM bootstrap/design and image generation) are stubbed at module
scope so the suite is deterministic and spends nothing. Background tasks run to
completion inside TestClient, so the portrait job is already done by the time the
generate-portrait call returns.
"""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services import imagegen, story


# ── Stubs ────────────────────────────────────────────────────────────────────
def _fake_bootstrap(theme, hint=""):
    return {
        "title": "Test Saga",
        "premise": "A test premise about testing.",
        "genre": "test",
        "tone": "wry",
        "art_style": "flat test style, bold outlines",
        "world_bible": "A small world built for assertions.",
        "characters": [
            {
                "name": "Hero One",
                "role": "protagonist",
                "concept": "the lead",
                "personality": {"traits": ["brave"], "motivations": "win", "voice": "clipped"},
                "appearance": "tall, short black hair, blue coat",
            },
            {
                "name": "Villain Two",
                "role": "antagonist",
                "concept": "the foe",
                "personality": {"traits": ["sly"]},
                "appearance": "thin, bald, piercing red eyes",
            },
        ],
    }


def _fake_design(series, concept):
    return {
        "name": "Added Char",
        "role": "supporting",
        "personality": {"traits": ["new"], "motivations": "help", "voice": "soft"},
        "backstory": "Joined the cast later.",
        "appearance_anchor": "round face, green wool hat, freckles",
        "portrait_prompt": "warm smile, three-quarter view",
    }


def _fake_image(prompt, reference_images=None, verbose=False):
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "navy").save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="module", autouse=True)
def mock_ai():
    orig = (story.bootstrap_series, story.design_character, imagegen.generate_image)
    story.bootstrap_series = _fake_bootstrap
    story.design_character = _fake_design
    imagegen.generate_image = _fake_image
    yield
    story.bootstrap_series, story.design_character, imagegen.generate_image = orig


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def series(client):
    r = client.post("/api/series", json={"theme": "test theme"})
    assert r.status_code == 200, r.text
    data = r.json()
    yield data
    client.delete(f"/api/series/{data['series']['series_id']}")


# ── Tests ────────────────────────────────────────────────────────────────────
def test_create_series_makes_cast(series):
    assert series["series"]["title"] == "Test Saga"
    assert series["series"]["art_style"]
    assert len(series["characters"]) == 2
    assert series["characters"][0]["status"] == "draft"
    # appearance flows into the consistency anchor field
    assert series["characters"][0]["appearance_anchor"].startswith("tall")


def test_portrait_generate_and_lock(client, series):
    cid = series["characters"][0]["character_id"]
    r = client.post(f"/api/characters/{cid}/generate-portrait")
    assert r.status_code == 200
    job_id = r.json()["job_id"]

    job = client.get(f"/api/jobs/{job_id}").json()
    assert job["status"] == "done", job
    assert job["result"]["url"].startswith("/api/assets/")

    ch = client.get(f"/api/characters/{cid}").json()["character"]
    assert ch["portrait_url"]
    assert len(ch["reference_urls"]) == 1

    locked = client.post(f"/api/characters/{cid}/lock").json()["character"]
    assert locked["status"] == "locked"


def test_lock_requires_portrait(client, series):
    # the second character has no portrait yet → cannot lock
    cid = series["characters"][1]["character_id"]
    r = client.post(f"/api/characters/{cid}/lock")
    assert r.status_code == 400


def test_add_character_with_ai(client, series):
    sid = series["series"]["series_id"]
    r = client.post(f"/api/series/{sid}/characters", json={"concept": "a loyal sidekick"})
    assert r.status_code == 200
    assert r.json()["character"]["name"] == "Added Char"


def test_update_character(client, series):
    cid = series["characters"][1]["character_id"]
    r = client.patch(f"/api/characters/{cid}", json={"backstory": "Rewritten history."})
    assert r.status_code == 200
    assert r.json()["character"]["backstory"] == "Rewritten history."
