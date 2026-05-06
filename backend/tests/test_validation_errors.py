"""Structured validation errors (422) and auth gates."""

from __future__ import annotations


def test_login_validation_returns_structured_error(client):
    r = client.post("/api/v1/auth/login", json={"email": "not-valid", "password": "x"})
    assert r.status_code == 422
    body = r.json()
    assert body.get("error", {}).get("code") == "VALIDATION_ERROR"
    assert "fields" in body.get("error", {})


def test_chat_empty_query_requires_auth_first(client):
    """Auth dependency executes before body validation on /chat."""
    r = client.post("/api/v1/chat", json={"query": "", "history": []})
    assert r.status_code == 401


def test_search_unauthenticated_returns_401(client):
    r = client.post("/api/v1/search", json={"query": "payments", "top_k": 5})
    assert r.status_code == 401


def test_search_invalid_token_returns_401(client):
    r = client.post(
        "/api/v1/search",
        json={"query": "payments", "top_k": 5},
        headers={"Authorization": "Bearer invalid"},
    )
    assert r.status_code == 401
