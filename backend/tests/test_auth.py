"""Auth API: login and current-user endpoints."""

from __future__ import annotations


def test_me_without_token_returns_401(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401
    body = r.json()
    assert body.get("error", {}).get("code") == "AUTH_REQUIRED"


def test_me_with_invalid_bearer_returns_401(client):
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"})
    assert r.status_code == 401


def test_login_unknown_user_returns_401(client, db_session):
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "TestPass1a"},
    )
    assert r.status_code == 401
    err = r.json().get("error", {})
    assert err.get("code") == "INVALID_CREDENTIALS"


def test_login_success_returns_token_and_user(client, seeded_employee, login_credentials):
    r = client.post("/api/v1/auth/login", json=login_credentials)
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data.get("token_type") == "bearer"
    assert data.get("user", {}).get("email") == login_credentials["email"].lower()


def test_me_with_valid_token_returns_profile(client, auth_headers, login_credentials):
    r = client.get("/api/v1/auth/me", headers=auth_headers)
    assert r.status_code == 200
    me = r.json()
    assert me["email"] == login_credentials["email"].lower()
    assert me["role"] == "employee"
    assert "portals" in me
