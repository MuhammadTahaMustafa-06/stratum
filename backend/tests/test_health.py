"""Liveness and OpenAPI smoke tests."""

from __future__ import annotations


def test_ping(client):
    r = client.get("/api/v1/ping")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "service": "stratum-api"}


def test_openapi_json_available(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    spec = r.json()
    assert spec.get("openapi")
    assert spec.get("info", {}).get("title") == "Stratum API"
    paths = spec.get("paths", {})
    assert "/api/v1/ping" in paths
    assert "/api/v1/auth/login" in paths
