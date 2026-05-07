# PostgreSQL (Neon) — full setup, auth, MFA

Stratum stores **all app data** in your PostgreSQL database (e.g. **Neon**): users, passwords (hashed), MFA secrets, articles, analytics, bookmarks, and learning metadata. ChromaDB and Whoosh stay on the API host’s disk by default — only **Postgres** is in Neon.

## 1. How auth fits with Neon

- **Database**: **Neon** (serverless PostgreSQL) holds `users`, MFA fields, knowledge tables, and `users.neon_auth_sub` (Neon Auth JWT `sub` when you use Google / hosted email sign-up).
- **Password + MFA**: **Stratum** — email + password in `users` (bcrypt), TOTP secrets, **JWT** access/refresh from this API.
- **Google / hosted email (Neon Auth)**: the **Neon Auth (Beta)** service in the Neon console; the browser uses `@neondatabase/auth`, then **POST `/auth/neon/exchange`** swaps the Neon access token for Stratum tokens.

## 2. Connection string

1. Neon console → copy the connection URI (pooler or direct is fine).
2. For this codebase, set **`DATABASE_URL`** in `backend/.env.local` (local) or `backend/.env` (Docker/EC2) using the **psycopg2** form:

   `postgresql+psycopg2://USER:PASSWORD@HOST/neondb?sslmode=require`

3. If you see driver errors with `channel_binding=require` in the URI, try the string **without** `channel_binding` (psycopg2 / some clients differ from psql).

## 3. Schema (tables)

On API startup, the app runs **`create_all`** plus small **additive** migrations. You normally **do not** hand-write DDL.

## 4. User and content provisioning

The API no longer auto-seeds demo users or sample knowledge articles on startup.

Use one of these approaches for provisioning:

- Admin APIs (recommended after first privileged account exists)
- SQL migration/bootstrap scripts in your deployment workflow
- Identity onboarding flow (password login and/or Neon Auth exchange)

## 5. MFA (TOTP)

1. Sign in with email/password in the portal.
2. Open **MFA setup** from the UI (profile / security path used in your build) and scan the QR code with an authenticator app.
3. After MFA is **enabled**, the next login shows a second step (TOTP or backup code).

All MFA state is stored in **Neon** on the `users` row.

## 6. Ingested PDFs (RAG) vs Neon

- **Structured KB rows** (articles metadata) live in Postgres.
- **Embeddings and BM25 index** default to local paths (`CHROMA_PERSIST_DIR`, `WHOOSH_INDEX_DIR`) on the machine running the API. For a **fully serverless** RAG you would need a different vector store — that is outside the default Stratum layout.

## 7. Production

Recommended:

- `ENVIRONMENT=production`
- `EXPOSE_API_DOCS=false`
- `RAG_WARMUP_ON_STARTUP=true` (or false if you intentionally favor faster boot over first-query latency)
