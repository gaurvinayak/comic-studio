"""
Phase 0 smoke tests — exercise the app wiring without hitting paid AI endpoints.
Requires MongoDB reachable at MONGO_URL (health pings it).

The client is context-managed so the app lifespan runs and every request shares a
single event loop (Motor needs that).
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"] == "comic-studio"


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert set(body["keys"]) == {"gemini", "anthropic", "openai"}


def test_unknown_asset_404(client):
    r = client.get("/api/assets/nope")
    assert r.status_code == 404


def test_unknown_job_404(client):
    r = client.get("/api/jobs/nope")
    assert r.status_code == 404
