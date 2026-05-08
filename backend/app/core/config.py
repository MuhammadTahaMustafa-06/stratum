from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Load optional `.env.local` then `.env` (later wins). Docker/production typically has only `.env`.
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )
    environment: str = "development"

    # ── Vector DB (ChromaDB) ──────────────────────────────────────────────────
    chroma_persist_dir: str = "data/chroma_db"
    chroma_collection: str = "bank_documents"

    # ── BM25 Index (Whoosh) ───────────────────────────────────────────────────
    whoosh_index_dir: str = "data/whoosh_index"

    # ── Data Paths ────────────────────────────────────────────────────────────
    data_dir: str = "data/raw"
    processed_dir: str = "data/processed"

    # ── LLM (Groq) ───────────────────────────────────────────────────────────
    groq_api_key: str = ""
    llm_model: str = "llama-3.3-70b-versatile"
    temperature: float = 0.2

    # ── Embedding & Reranking ─────────────────────────────────────────────────
    embedding_model: str = "all-MiniLM-L6-v2"
    reranker_model: str = "BAAI/bge-reranker-base"
    reranker_threshold: float = -2.0

    # ── Retrieval Tuning ──────────────────────────────────────────────────────
    top_k_vector: int = 10
    top_k_bm25: int = 10
    top_k_fusion: int = 15
    top_k_rerank: int = 5
    search_default_top_k: int = 10
    low_confidence_threshold: float = 0.45

    # ── Langfuse Observability ────────────────────────────────────────────────
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # ── Auth / RBAC ───────────────────────────────────────────────────────────
    # Required in all environments when strict auth checks are enabled.
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60        # short-lived access token
    jwt_refresh_days: int = 30          # long-lived refresh token
    jwt_issuer: str = "stratum-api"
    jwt_audience: str = "stratum-web"
    jwt_clock_skew_seconds: int = 30
    strict_auth_checks: bool = True

    # ── Session cookie (dev + production) ─────────────────────────────────────
    # Default on: refresh is HttpOnly cookie only; JSON omits refresh_token. Secure=false on HTTP dev.
    # Opt out: AUTH_REFRESH_HTTPONLY_COOKIE=false (pair with VITE_AUTH_REFRESH_COOKIE=false).
    auth_refresh_httponly_cookie: bool = True
    auth_refresh_cookie_name: str = "stratum_refresh"
    auth_cookie_domain: str = ""  # e.g. .bank.example.com — leave empty for host-only
    auth_cookie_samesite: str = "lax"  # lax | strict | none (none requires HTTPS + Secure)
    # Override auto secure flag (default: secure=True in production when unset)
    auth_cookie_secure: bool | None = None

    # ── Database (PostgreSQL — e.g. Neon URI from dashboard; use postgresql+psycopg2://...) ───
    database_url: str = ""
    # When true: resolve DB hostname via DNS-over-HTTPS and pass hostaddr to libpq (ISP/VPN issues).
    database_dns_fallback: bool = False
    # Optional literal IPv4/IPv6 for libpq hostaddr (skips DoH).
    database_hostaddr: str = ""

    # ── Neon Auth — OAuth / email signup (Console → Auth URL; JWKS at that URL + /.well-known/jwks.json)
    # Same string as frontend VITE_NEON_AUTH_URL.
    neon_auth_url: str = ""
    allow_oauth_signup: bool = True
    oauth_default_role: str = "employee"
    # Deprecated: app MFA is enforced whenever enabled for the user.
    neon_exchange_require_app_mfa: bool = True

    # ── CORS / Security ───────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,https://stratum.page,https://www.stratum.page"
    allowed_hosts: str = "localhost,127.0.0.1,stratum.page,www.stratum.page,backend,testserver"
    max_request_size_mb: int = 10

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    rate_limit_enabled: bool = True
    rate_limit_storage_url: str = "memory://"  # use redis://... in prod

    # ── Feature Flags ─────────────────────────────────────────────────────────
    expose_api_docs: bool = False
    enable_admin_reindex: bool = True
    enforce_metadata_team_scope: bool = False
    # Skip heavy embedding/reranker preload during local iteration if needed.
    rag_warmup_on_startup: bool = True

    # ── Observability (Prometheus scrape / Grafana dashboards) ────────────────
    metrics_enabled: bool = False
    otel_exporter_otlp_endpoint: str = ""

    # ── Object storage (AWS S3) — optional; used for user avatar uploads in production ──
    # When s3_avatar_bucket is set, POST /auth/me/avatar uploads to S3 instead of local disk.
    # On EC2, prefer IAM instance profile credentials; keys are optional when using a role.
    s3_avatar_bucket: str = ""
    s3_avatar_region: str = ""  # e.g. us-east-1; empty = default boto3 resolution
    s3_endpoint_url: str = ""  # optional (LocalStack / custom S3-compatible)
    s3_avatar_key_prefix: str = "avatars"
    # Public HTTPS base for browser-accessible object URLs (no trailing slash).
    # Examples: https://d111111abcdef8.cloudfront.net  or  https://my-bucket.s3.us-east-1.amazonaws.com
    s3_public_base_url: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""


settings = Settings()
