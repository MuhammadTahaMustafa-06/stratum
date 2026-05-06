"""
Pytest bootstrap: set env before any app imports so Settings + SQLAlchemy engine pick them up.

Requires PostgreSQL (see README / CI). Local default matches docker-compose style URL on 127.0.0.1:5432.
"""
from __future__ import annotations

import os

# Must run before importing app.* (engine binds at import time)
os.environ.setdefault("JWT_SECRET_KEY", "pytest-jwt-secret-key-min-32-chars!!")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/stratum_test",
)
os.environ.setdefault("GROQ_API_KEY", "pytest-dummy-groq-key")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("STRICT_AUTH_CHECKS", "false")
os.environ.setdefault("SEED_DEMO_USERS", "false")
os.environ.setdefault("SEED_SAMPLE_KNOWLEDGE_ARTICLES", "false")
os.environ.setdefault("METRICS_ENABLED", "false")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

# Stable credentials for integration-style auth tests (database must be reachable).
TEST_USER_EMAIL = "stratum.pytest@example.local"
TEST_USER_PASSWORD = "TestPass1a"


@pytest.fixture()
def client() -> TestClient:
    from app.main import app

    return TestClient(app)


@pytest.fixture()
def db_session():
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        try:
            db.execute(text("SELECT 1"))
        except SQLAlchemyError as exc:
            pytest.skip(f"PostgreSQL test database is unavailable/misconfigured: {exc}")
        yield db
    finally:
        db.close()


@pytest.fixture()
def login_credentials() -> dict[str, str]:
    return {"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}


@pytest.fixture()
def seeded_employee(db_session, login_credentials: dict[str, str]):
    """Single employee user for login /me tests (idempotent)."""
    from sqlalchemy import select

    from app.auth.roles import EMPLOYEE
    from app.core.security import hash_password
    from app.models.user import User

    email = login_credentials["email"].lower()
    pwd = login_credentials["password"]
    existing = db_session.scalars(select(User).where(User.email == email)).first()
    if existing:
        return existing
    user = User(
        email=email,
        hashed_password=hash_password(pwd),
        full_name="Pytest User",
        role=EMPLOYEE,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def auth_headers(client: TestClient, seeded_employee, login_credentials: dict[str, str]) -> dict[str, str]:
    r = client.post("/api/v1/auth/login", json=login_credentials)
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
