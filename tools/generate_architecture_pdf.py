"""
Generate a comprehensive Stratum Architecture PDF document.
Usage: cd Bank_RAG_Chatbot && python tools/generate_architecture_pdf.py
Output: docs/Stratum_Architecture.pdf
"""

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from pathlib import Path

# ─── Colours ─────────────────────────────────────────────────────────────────
C_ACCENT   = (37,  99, 235)
C_ACCENT2  = (16, 185, 129)
C_SECTION  = (30,  58, 138)
C_DARK     = (15,  23,  42)
C_MID      = (71,  85, 105)
C_LIGHT    = (148,163, 184)
C_BG       = (241,245, 249)
C_TABLE_H  = (37,  99, 235)
C_TABLE_ALT= (248,250, 252)
C_WHITE    = (255,255, 255)
C_WARN     = (245,158,  11)
C_SUCCESS  = (16, 185, 129)

# ─── Font discovery ───────────────────────────────────────────────────────────
_FONT_CANDIDATES = [
    ("C:/Windows/Fonts/calibri.ttf",  "C:/Windows/Fonts/calibrib.ttf",  "C:/Windows/Fonts/calibrii.ttf"),
    ("C:/Windows/Fonts/arial.ttf",    "C:/Windows/Fonts/arialbd.ttf",   "C:/Windows/Fonts/ariali.ttf"),
    ("C:/Windows/Fonts/verdana.ttf",  "C:/Windows/Fonts/verdanab.ttf",  "C:/Windows/Fonts/verdanai.ttf"),
]
_reg, _bold, _italic = None, None, None
for r, b, it in _FONT_CANDIDATES:
    if Path(r).exists() and Path(b).exists():
        _reg, _bold, _italic = r, b, it
        break
if not _reg:
    raise SystemExit("No suitable Windows TTF font found. Install Calibri or Arial.")


# ─── PDF class ────────────────────────────────────────────────────────────────
class PDF(FPDF):
    def __init__(self):
        super().__init__("P", "mm", "A4")
        self.add_font("f",  "",  _reg)
        self.add_font("f",  "B", _bold)
        if _italic and Path(_italic).exists():
            self.add_font("f", "I", _italic)
        self.set_auto_page_break(True, 18)
        self.set_margins(14, 14, 14)

    # ── page chrome ───────────────────────────────────────────────────────────
    def header(self):
        if self.page_no() == 1:
            return
        self.set_fill_color(*C_ACCENT)
        self.rect(0, 0, 210, 7.5, "F")
        self.set_font("f", "B", 7)
        self.set_text_color(*C_WHITE)
        self.set_xy(14, 1.5)
        self.cell(0, 4.5, "STRATUM  |  Architecture & Documentation Reference")
        self.set_xy(0, 1.5)
        self.cell(196, 4.5, f"Page {self.page_no()}", align="R")
        self.set_text_color(*C_DARK)
        self.set_y(10)

    def footer(self):
        self.set_y(-11)
        self.set_font("f", "", 6.5)
        self.set_text_color(*C_LIGHT)
        self.cell(0, 4, "Stratum v2.0  |  Internal KM Platform for Banking Teams  |  Confidential Internal Use", align="C")

    # ── primitives ────────────────────────────────────────────────────────────
    def f(self, style="", size=9):
        self.set_font("f", style, size)

    def section(self, text, num=""):
        self.ln(3)
        self.set_fill_color(*C_SECTION)
        self.set_text_color(*C_WHITE)
        self.f("B", 11)
        label = f"  {num}  {text}" if num else f"  {text}"
        self.cell(0, 9, label, new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
        self.set_text_color(*C_DARK)
        self.ln(2)

    def h2(self, text):
        self.ln(2)
        self.f("B", 9)
        self.set_text_color(*C_ACCENT)
        self.cell(0, 6, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(*C_DARK)

    def body(self, text, size=8.5):
        self.f("", size)
        self.set_text_color(*C_MID)
        self.multi_cell(0, 4.8, text)
        self.set_text_color(*C_DARK)

    def bullet(self, text, indent=4):
        self.f("", 8)
        self.set_text_color(*C_MID)
        self.set_x(self.l_margin + indent)
        self.multi_cell(0, 4.8, f"\u2022  {text}")
        self.set_text_color(*C_DARK)
        self.set_x(self.l_margin)

    def kv(self, key, val):
        pw = self.w - self.l_margin - self.r_margin
        self.f("B", 8)
        self.set_text_color(*C_DARK)
        self.cell(52, 5.5, key, border="B")
        self.f("", 8)
        self.set_text_color(*C_MID)
        self.multi_cell(pw - 52, 5.5, val, border="B")
        self.set_text_color(*C_DARK)

    def table(self, headers, rows, widths=None):
        pw = self.w - self.l_margin - self.r_margin
        n = len(headers)
        if not widths:
            widths = [pw / n] * n

        # header
        self.set_fill_color(*C_TABLE_H)
        self.set_text_color(*C_WHITE)
        self.f("B", 7.5)
        for i, h in enumerate(headers):
            self.cell(widths[i], 6.5, f"  {h}", border=0, fill=True)
        self.ln()

        self.f("", 7)
        for ri, row in enumerate(rows):
            fill = C_TABLE_ALT if ri % 2 == 0 else C_WHITE
            self.set_fill_color(*fill)
            self.set_text_color(*C_DARK)

            # Estimate row height
            mh = 6
            for ci, cell in enumerate(row):
                if ci < len(widths):
                    lines = max(1, len(str(cell)) // max(1, int(widths[ci] / 1.9)))
                    mh = max(mh, lines * 5 + 1)

            x0, y0 = self.get_x(), self.get_y()
            if y0 + mh > self.h - self.b_margin:
                self.add_page()
                # re-draw header
                self.set_fill_color(*C_TABLE_H)
                self.set_text_color(*C_WHITE)
                self.f("B", 7.5)
                for i, h in enumerate(headers):
                    self.cell(widths[i], 6.5, f"  {h}", border=0, fill=True)
                self.ln()
                self.f("", 7)
                x0, y0 = self.get_x(), self.get_y()

            for ci, cell in enumerate(row):
                if ci >= len(widths):
                    break
                w = widths[ci]
                xx = x0 + sum(widths[:ci])
                self.set_xy(xx, y0)
                self.set_fill_color(*fill)
                self.rect(xx, y0, w, mh, "F")
                self.set_xy(xx + 1.5, y0 + 0.8)
                self.set_text_color(*C_DARK)
                self.multi_cell(w - 2.5, 4.8, str(cell), border=0)

            self.set_xy(x0, y0 + mh)
        self.ln(2)

    def flow_box(self, label, sub="", accent=False, w=0, h=13):
        pw = self.w - self.l_margin - self.r_margin
        bw = w or pw
        bx, by = self.get_x(), self.get_y()
        if by + h > self.h - self.b_margin:
            self.add_page()
            bx, by = self.get_x(), self.get_y()
        bg = C_ACCENT if accent else C_BG
        bc = C_ACCENT if accent else C_LIGHT
        self.set_fill_color(*bg)
        self.set_draw_color(*bc)
        self.rect(bx, by, bw, h, "FD")
        tc = C_WHITE if accent else C_DARK
        sc = (200, 220, 255) if accent else C_MID
        self.f("B", 8)
        self.set_text_color(*tc)
        ly = by + (h - (9.5 if sub else 5)) / 2
        self.set_xy(bx + 2, ly)
        self.cell(bw - 4, 5, label, align="C")
        if sub:
            self.f("", 6.5)
            self.set_text_color(*sc)
            self.set_xy(bx + 2, ly + 5.5)
            self.cell(bw - 4, 4, sub, align="C")
        self.set_draw_color(0, 0, 0)
        self.set_text_color(*C_DARK)
        self.set_xy(bx + bw, by)

    def arrow_down(self, label=""):
        cx = (self.l_margin + self.w - self.r_margin) / 2
        y = self.get_y()
        self.set_draw_color(*C_LIGHT)
        self.line(cx, y, cx, y + 4)
        if label:
            self.f("", 6)
            self.set_text_color(*C_LIGHT)
            self.set_xy(cx + 2, y)
            self.cell(50, 4, label)
        self.set_draw_color(0, 0, 0)
        self.set_text_color(*C_DARK)
        self.set_y(y + 4)


# ─── Build ────────────────────────────────────────────────────────────────────
def build():
    pdf = PDF()

    # =====================================================================
    # PAGE 1  Title
    # =====================================================================
    pdf.add_page()
    pdf.set_fill_color(*C_ACCENT)
    pdf.rect(0, 0, 210, 58, "F")
    pdf.set_text_color(*C_WHITE)
    pdf.f("B", 34)
    pdf.set_xy(14, 13)
    pdf.cell(0, 15, "STRATUM")
    pdf.f("", 13)
    pdf.set_xy(14, 30)
    pdf.cell(0, 8, "Internal Knowledge Management Platform for Banking Teams")
    pdf.f("", 9)
    pdf.set_xy(14, 40)
    pdf.cell(0, 6, "Architecture  |  RAG Pipeline  |  DevOps  |  MLOps  |  Security")
    pdf.set_xy(14, 48)
    pdf.f("", 8)
    pdf.cell(0, 5, "v2.0  |  FastAPI + React 19 + ChromaDB + Neon PostgreSQL + Groq LLM")

    pdf.set_text_color(*C_DARK)
    pdf.set_y(64)

    # Tagline banner
    pdf.set_fill_color(*C_BG)
    pdf.rect(14, 62, 182, 13, "F")
    pdf.f("I", 10)
    pdf.set_text_color(*C_ACCENT)
    pdf.set_xy(14, 65.5)
    pdf.cell(182, 7, '"Knowledge that stacks."', align="C")
    pdf.set_text_color(*C_DARK)

    # Stats grid
    stats = [
        ("API Version", "v2.0"),
        ("Backend",     "FastAPI 0.115+"),
        ("Frontend",    "React 19 + Vite 7"),
        ("LLM",         "Groq llama-3.3-70b"),
        ("Embeddings",  "all-MiniLM-L6-v2"),
        ("Reranker",    "bge-reranker-base"),
        ("Vector DB",   "ChromaDB"),
        ("Primary DB",  "Neon PostgreSQL"),
        ("Auth",        "JWT HS256 + MFA"),
        ("CI/CD",       "GitHub Actions"),
        ("Containers",  "Docker + K8s"),
        ("Observability","Prometheus + Langfuse"),
    ]
    cols, bw, bh, x0 = 3, 59, 14, 14
    base_y = 79
    for i, (k, v) in enumerate(stats):
        col = i % cols
        row = i // cols
        xc = x0 + col * (bw + 2)
        yc = base_y + row * (bh + 2)
        pdf.set_fill_color(*C_WHITE)
        pdf.set_draw_color(*C_LIGHT)
        pdf.rect(xc, yc, bw, bh, "FD")
        pdf.f("", 7)
        pdf.set_text_color(*C_MID)
        pdf.set_xy(xc + 2, yc + 1.5)
        pdf.cell(bw - 3, 4, k)
        pdf.f("B", 8.5)
        pdf.set_text_color(*C_ACCENT)
        pdf.set_xy(xc + 2, yc + 6.5)
        pdf.cell(bw - 3, 5, v)
    pdf.set_draw_color(0, 0, 0)
    pdf.set_text_color(*C_DARK)

    rows_count = (len(stats) + cols - 1) // cols
    pdf.set_y(base_y + rows_count * (bh + 2) + 4)

    # TOC
    pdf.set_fill_color(*C_SECTION)
    pdf.set_text_color(*C_WHITE)
    pdf.f("B", 9)
    pdf.cell(0, 7, "  CONTENTS", new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
    pdf.set_text_color(*C_DARK)
    toc = [
        ("1",  "Problem Statement and Solution"),
        ("2",  "System Architecture"),
        ("3",  "RAG Pipeline: Ingestion and Query Path"),
        ("4",  "Authentication and Session Model"),
        ("5",  "Article Lifecycle and Knowledge Governance"),
        ("6",  "RBAC and Portal Access Matrix"),
        ("7",  "DevOps and CI/CD Pipeline"),
        ("8",  "MLOps Lifecycle"),
        ("9",  "API Endpoints Reference"),
        ("10", "Full Tech Stack"),
        ("11", "Database Schema"),
        ("12", "Security Posture"),
        ("13", "Quick Setup Reference"),
    ]
    for num, title in toc:
        pdf.f("", 8.5)
        pdf.set_text_color(*C_MID)
        pdf.set_x(pdf.l_margin + 3)
        pdf.cell(10, 5.5, num + ".")
        pdf.cell(0, 5.5, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*C_DARK)

    # =====================================================================
    # PAGE 2  Problem + Solution
    # =====================================================================
    pdf.add_page()
    pdf.section("Problem Statement and Solution", "1")

    pdf.h2("The Problem: Banking Knowledge Fragmentation")
    pdf.table(
        ["Challenge", "Business Impact"],
        [
            ["Scattered documentation",    "Policies in SharePoint, runbooks in Confluence, diagrams in emails. No single source of truth."],
            ["High onboarding friction",   "New engineers spend 3-6 weeks learning institutional knowledge that should be findable in minutes."],
            ["Compliance risk",            "Outdated or misinterpreted policy documents create operational and regulatory exposure."],
            ["Poor search tools",          "Keyword-only search misses semantic context; staff cannot find what they do not know to search for."],
            ["No audit trail",             "No record of who accessed what knowledge, which questions go unanswered, or where content gaps exist."],
            ["Expert bottlenecks",         "SMEs become single points of failure because domain knowledge is not codified or searchable."],
        ],
        [62, 118],
    )

    pdf.h2("The Solution: What Stratum Delivers")
    pdf.table(
        ["Stratum Capability", "How It Solves the Problem"],
        [
            ["Unified knowledge portal",   "All approved docs in one searchable, governed platform with lifecycle and version control."],
            ["Hybrid RAG AI copilot",      "Vector + BM25 + CrossEncoder reranking + Groq LLM. Every answer cites its source documents."],
            ["Article governance",         "Draft -> In Review -> Published -> Archived. Full version history per edit."],
            ["Document quality gate",      "PDF upload runs pdfplumber heuristics. Tier: ok / warn / fail before any indexing."],
            ["Knowledge gap analytics",    "Every unanswered query is logged. Admins see aggregated gaps to guide content creation."],
            ["RBAC and audit trail",       "Role-gated access, query logs, admin event log, Langfuse LLM tracing."],
            ["MFA and SSO",                "TOTP multi-factor auth + Neon Auth Google/email SSO in addition to email+password."],
        ],
        [65, 115],
    )

    # =====================================================================
    # PAGE 3  Architecture
    # =====================================================================
    pdf.add_page()
    pdf.section("System Architecture", "2")
    pdf.body(
        "Stratum follows a layered architecture: React SPA -> Nginx Edge -> FastAPI Backend -> Data Stores + External Services. "
        "Each layer has a single responsibility and communicates via well-defined interfaces (HTTPS/JWT, SQLAlchemy, ChromaDB client, Groq REST API)."
    )
    pdf.ln(3)

    pw = pdf.w - pdf.l_margin - pdf.r_margin

    pdf.flow_box("React 19 SPA  |  Vite 7 + Tailwind CSS v3", "/portal/knowledge  |  /portal/admin  |  /login  |  /mfa  |  /profile", accent=True, w=pw, h=13)
    pdf.arrow_down("HTTPS + Bearer JWT / HttpOnly Cookie")
    pdf.flow_box("Edge  |  Nginx Reverse Proxy (EC2) or Kubernetes Ingress", "TLS termination  |  /api/* -> backend :8000  |  /* -> frontend :8080", w=pw, h=13)
    pdf.arrow_down()

    # Side-by-side boxes
    half = (pw - 3) / 2
    bx = pdf.l_margin
    by = pdf.get_y()
    bh2 = 52

    pdf.set_fill_color(*C_BG)
    pdf.set_draw_color(*C_LIGHT)
    pdf.rect(bx, by, half, bh2, "FD")
    pdf.f("B", 8)
    pdf.set_text_color(*C_ACCENT)
    pdf.set_xy(bx + 2, by + 2)
    pdf.cell(half - 4, 5, "FastAPI Backend v2.0  (Python 3.11+)")
    be_items = [
        "Auth Layer: JWT HS256 + bcrypt + pyotp TOTP",
        "RBAC Middleware: 4 role levels",
        "RAG Pipeline: 7-stage guardrails -> LLM",
        "Content Service: articles + versioning",
        "Analytics: query logs + gap detection",
        "SlowAPI Rate Limiter (200 req/min)",
        "Prometheus /metrics endpoint",
        "Security headers (CSP, HSTS, X-Frame)",
    ]
    pdf.f("", 7)
    pdf.set_text_color(*C_MID)
    cy = by + 8
    for item in be_items:
        pdf.set_xy(bx + 4, cy)
        pdf.cell(half - 6, 4.5, f"+ {item}")
        cy += 4.8

    fx = bx + half + 3
    pdf.set_fill_color(*C_BG)
    pdf.rect(fx, by, half, bh2, "FD")
    pdf.f("B", 8)
    pdf.set_text_color(*C_ACCENT)
    pdf.set_xy(fx + 2, by + 2)
    pdf.cell(half - 4, 5, "Frontend Container  (nginx:alpine :8080)")
    fe_items = [
        "React 19 + Vite 7 + Tailwind CSS v3",
        "Dark / light theme toggle",
        "react-router-dom v7 (SPA routing)",
        "Axios API client with JWT interceptor",
        "@neondatabase/auth (SSO bridge)",
        "Framer Motion animations",
        "Sonner toast notifications",
        "Protected routes (RBAC-aware)",
    ]
    pdf.f("", 7)
    pdf.set_text_color(*C_MID)
    cy = by + 8
    for item in fe_items:
        pdf.set_xy(fx + 4, cy)
        pdf.cell(half - 6, 4.5, f"+ {item}")
        cy += 4.8

    pdf.set_y(by + bh2)
    pdf.set_draw_color(0, 0, 0)
    pdf.arrow_down()

    # Data stores
    stores = [
        ("Neon PostgreSQL",   "Users + Articles\nAnalytics + MFA"),
        ("ChromaDB",          "Vector Store\n384-dim embeddings"),
        ("Whoosh BM25",       "Keyword Index\nRebuilt on ingest"),
        ("Groq LLM API",      "llama-3.3-70b\nInference"),
        ("Langfuse (opt.)",   "LLM tracing\nCost + latency"),
    ]
    sw = pw / len(stores) - 1.5
    sx0 = pdf.l_margin
    sy = pdf.get_y()
    for i, (nm, sb) in enumerate(stores):
        xc = sx0 + i * (sw + 1.9)
        pdf.set_fill_color(*C_TABLE_ALT)
        pdf.set_draw_color(*C_LIGHT)
        pdf.rect(xc, sy, sw, 17, "FD")
        pdf.f("B", 7)
        pdf.set_text_color(*C_DARK)
        pdf.set_xy(xc + 1, sy + 2)
        pdf.cell(sw - 2, 4.5, nm, align="C")
        pdf.f("", 6.5)
        pdf.set_text_color(*C_MID)
        pdf.set_xy(xc + 1, sy + 7)
        pdf.multi_cell(sw - 2, 4, sb, align="C")

    pdf.set_y(sy + 19)
    pdf.set_text_color(*C_DARK)
    pdf.set_draw_color(0, 0, 0)

    # =====================================================================
    # PAGE 4  RAG Pipeline
    # =====================================================================
    pdf.add_page()
    pdf.section("RAG Pipeline: Ingestion and Query Path", "3")

    pdf.h2("Document Ingestion Pipeline  (LangGraph state machine)")
    pdf.table(
        ["Stage", "What It Does"],
        [
            ["extract.py",  "pdfplumber: text + tables + page metadata. File-hash dedup skips unchanged files."],
            ["clean.py",    "Normalize whitespace, strip headers/footers, preserve page-level metadata."],
            ["chunk.py",    "tiktoken cl100k_base. 400-token windows. 80-token overlap. Table-aware splits."],
            ["embed.py",    "SentenceTransformers all-MiniLM-L6-v2. 384-dim vectors. Batch size 64."],
            ["store.py",    "Write chunks + embeddings to ChromaDB. Rebuild Whoosh BM25 index from Chroma docs."],
        ],
        [35, 145],
    )

    pdf.h2("Real-time Query Pipeline  (per request; singletons loaded once per process)")
    pdf.table(
        ["Stage", "Detail"],
        [
            ["1  Input Guardrail",      "Injection regex + blocklist check. Blocked -> HTTP 400 before any retrieval."],
            ["2  Hybrid Retrieval",     "Chroma dense search (cosine, top-K) + Whoosh BM25 (TF-IDF, top-K). Run in parallel."],
            ["3  RRF Fusion",           "Reciprocal Rank Fusion merges both ranked lists. Score = 1/(k+rank), k=60. No calibration needed."],
            ["4  CrossEncoder Rerank",  "BAAI/bge-reranker-base scores each (query, chunk) pair. Chunks below threshold are dropped."],
            ["5  Output Guardrail",     "PII masking (phone, email, card regex). If no chunk exceeds threshold -> 'not enough info'."],
            ["6  Groq LLM Generation",  "llama-3.3-70b-versatile. Banking system prompt + anti-hallucination instruction. Temperature 0."],
            ["7  Citations + Logging",  "Source document names and page numbers extracted. Query logged: answered, latency_ms, source_ids."],
        ],
        [48, 132],
    )

    pdf.h2("Why Hybrid Retrieval?")
    pdf.table(
        ["Signal", "Handles", "Component"],
        [
            ["Semantic (vector)",  "Conceptual and paraphrased queries",                     "ChromaDB cosine similarity"],
            ["Keyword (BM25)",     "Exact regulatory codes: KYC, AML, PSD2, FATF, SWIFT",   "Whoosh BM25"],
            ["RRF Fusion",         "Combines both ranked lists without score normalization",   "RRF k=60"],
            ["CrossEncoder",       "Accurate pairwise relevance; applied to shortlist only",  "bge-reranker-base"],
        ],
        [42, 88, 50],
    )

    pdf.h2("Guardrails Design")
    pdf.table(
        ["Layer", "Triggers On", "Action"],
        [
            ["Input: injection check",  "Override patterns ('ignore instructions', 'system:', etc.)",   "HTTP 400 - blocked before RAG"],
            ["Input: blocklist",        "Out-of-scope topic categories",                                "HTTP 400 - not processed"],
            ["Output: low confidence",  "No chunk above RERANKER_THRESHOLD",                           "Return 'insufficient info' - no LLM call"],
            ["Output: PII masking",     "Phone, email, 16-digit card numbers in LLM output",            "Regex strip post-generation"],
        ],
        [45, 85, 50],
    )

    pdf.h2("Configuration Variables")
    pdf.table(
        ["Variable", "Default", "Description"],
        [
            ["EMBEDDING_MODEL",    "all-MiniLM-L6-v2",        "HuggingFace embedding model name"],
            ["RERANKER_MODEL",     "BAAI/bge-reranker-base",   "CrossEncoder reranker model"],
            ["GROQ_MODEL",         "llama-3.3-70b-versatile",  "Groq LLM model ID"],
            ["TOP_K_VECTOR",       "20",                        "Dense neighbours to retrieve"],
            ["TOP_K_BM25",         "20",                        "BM25 matches to retrieve"],
            ["RERANKER_THRESHOLD", "0.0",                       "Minimum CrossEncoder score to keep chunk"],
            ["TOP_K_FINAL",        "5",                         "Max chunks passed to LLM after reranking"],
            ["CHUNK_SIZE",         "400 tokens",                "tiktoken cl100k_base window size"],
            ["CHUNK_OVERLAP",      "80 tokens",                 "Overlap between consecutive chunks"],
        ],
        [58, 54, 68],
    )

    # =====================================================================
    # PAGE 5  Auth + Lifecycle + RBAC
    # =====================================================================
    pdf.add_page()
    pdf.section("Authentication and Session Model", "4")
    pdf.table(
        ["Auth Path", "Endpoint", "Mechanism"],
        [
            ["Email / Password",  "POST /auth/login",             "bcrypt hash verification. JWT access token (15 min) + HttpOnly refresh cookie (7 days). MFA challenge if TOTP enabled."],
            ["Google / Neon SSO", "POST /auth/neon/exchange",     "User completes Neon Auth OAuth in browser. SPA sends Neon token; API verifies and issues Stratum JWT. User upserted with neon_auth_sub."],
            ["MFA Setup",         "POST /auth/mfa/setup+confirm", "pyotp TOTP. QR code URI returned for authenticator app. Secret stored in users table."],
            ["MFA Login",         "POST /auth/mfa/verify-login",  "TOTP 6-digit code or single-use backup code (bcrypt-hashed). On success, full token pair issued."],
            ["Token Refresh",     "POST /auth/refresh",           "HttpOnly cookie sent automatically. Returns new access token. Refresh hash validated against DB."],
            ["Logout",            "POST /auth/logout",            "Clears refresh hash in DB. All active sessions invalidated. Cookie cleared."],
        ],
        [35, 48, 97],
    )

    pdf.h2("Token Security Model")
    pdf.table(
        ["Token", "Properties", "Security Note"],
        [
            ["Access token",       "JWT HS256, 15-min expiry, role + user_id claims",  "Stored in memory by SPA; never in localStorage"],
            ["Refresh token",      "HttpOnly cookie, 7-day expiry",                    "JS cannot read it; safe from XSS. Sent automatically on /auth/refresh."],
            ["Refresh hash in DB", "SHA-256 hash stored on users row",                 "Logout and password changes immediately invalidate all sessions globally."],
            ["MFA backup codes",   "bcrypt hashed, limited count, single-use",         "User must regenerate after exhaustion. Cannot be viewed again after creation."],
        ],
        [38, 72, 70],
    )

    pdf.section("Article Lifecycle and Knowledge Governance", "5")
    pdf.table(
        ["State", "Who Can Transition", "Visibility"],
        [
            ["Draft",      "Author creates; author + admins edit",           "Only author and admins"],
            ["In Review",  "Author submits; knowledge_admin/expert reviews",  "Author and admins"],
            ["Published",  "knowledge_admin or domain_expert approves",       "All employees; appears in search and RAG"],
            ["Archived",   "knowledge_admin or system_admin archives",        "Hidden from search; version history retained"],
        ],
        [30, 75, 75],
    )
    pdf.body(
        "Each article edit creates a snapshot in article_versions (author_id, timestamp, full body). "
        "Status transitions are recorded in the audit event log accessible to system_admin."
    )

    pdf.section("RBAC: Roles and Portal Access", "6")
    pdf.table(
        ["Role", "Knowledge Hub", "KB Management", "Admin Console", "User Mgmt"],
        [
            ["employee",        "Search, Chat, Ask, Bookmarks, Feedback, Learning paths", "Read published only",               "No access",                   "No access"],
            ["knowledge_admin", "Full access",                                             "Create, Edit, Publish, Upload PDFs", "Analytics, Gaps, Feedback",   "No access"],
            ["domain_expert",   "Full access",                                             "Create, Edit, Review articles",      "Analytics, Gaps",             "No access"],
            ["system_admin",    "Full access",                                             "Full KB management",                 "Full admin console",          "Users CRUD + Audit log"],
        ],
        [35, 63, 42, 32, 28],
    )

    # =====================================================================
    # PAGE 6  DevOps
    # =====================================================================
    pdf.add_page()
    pdf.section("DevOps and CI/CD Pipeline", "7")
    pdf.body(
        "Full lifecycle: developer push -> GitHub Actions CI -> Docker build + Trivy scan -> Tag v*.*.* -> "
        "image push to GHCR -> SSH deploy to EC2 -> smoke test -> auto-rollback on failure."
    )

    pdf.h2("CI Checks (every push/PR)")
    pdf.table(
        ["Tool", "Type", "What It Checks"],
        [
            ["gitleaks",   "Secret scanning",          "Blocks any credential or API key committed to repo"],
            ["ruff",       "Python linting + style",    "Applied to app/ + ingestion/ + tests/"],
            ["mypy",       "Python type checking",      "Strict annotations enforced on app/"],
            ["bandit",     "Python SAST security",      "OWASP-aligned; flags common Python security issues"],
            ["pytest",     "Unit + integration tests",  "Postgres 16 service container; tests in backend/tests/"],
            ["ESLint",     "JavaScript/React lint",     "eslint 9 flat config"],
            ["Vite build", "Frontend prod build smoke", "Validates JSX compilation and import resolution"],
            ["Trivy",      "Container CVE scan",        "CRITICAL severity exits 1, blocks merge on main branch"],
        ],
        [28, 40, 112],
    )

    pdf.h2("CD: Release Process (tag v*.*.*)")
    pdf.table(
        ["Step", "Where", "Action"],
        [
            ["1. Tag", "Local",            "git tag v1.2.0 && git push origin v1.2.0"],
            ["2. Build", "GitHub Actions", "docker build backend + frontend; inject VITE_* build-time env from GH secrets"],
            ["3. Push",  "GitHub Actions", "docker push to GHCR: ghcr.io/org/stratum-backend:v1.2.0"],
            ["4. SSH",   "GitHub Actions", "SSH to EC2 host; run deploy/docker/scripts/deploy.sh"],
            ["5. Deploy","EC2 host",        "docker compose pull + docker compose up -d --remove-orphans"],
            ["6. Smoke", "EC2 host",        "GET /api/v1/ping -> assert HTTP 200 + {status:ok}"],
            ["7. Done or rollback", "EC2", "Rollback: export APP_TAG_PREVIOUS=v1.1.0; run rollback.sh"],
        ],
        [35, 38, 107],
    )

    pdf.h2("Docker Compose Services (deploy/docker/docker-compose.yml)")
    pdf.table(
        ["Service", "Image", "Port", "Purpose"],
        [
            ["backend",    "ghcr.io/org/stratum-backend:${APP_TAG}", "8000",   "FastAPI + Uvicorn"],
            ["frontend",   "ghcr.io/org/stratum-frontend:${APP_TAG}", "8080",  "nginx serving React SPA"],
            ["redis",      "redis:7-alpine",                          "6379",  "Rate limit storage (internal)"],
            ["prometheus", "prom/prometheus",                         "9090",  "Metrics (observability profile)"],
            ["grafana",    "grafana/grafana",                         "3000",  "Dashboards (observability profile)"],
        ],
        [28, 78, 16, 58],
    )

    pdf.h2("Observability Stack")
    pdf.table(
        ["Tool", "Interface", "Captures"],
        [
            ["Prometheus", "/metrics (auto-instrumented)", "HTTP request rate, error rate, latency histogram per endpoint"],
            ["Grafana",    "Dashboard at :3000",           "Prometheus visualizations; alert on 5xx spike, high P95 latency"],
            ["Langfuse",   "Cloud SaaS (optional)",        "LLM traces: prompt, output, token count, cost, end-to-end latency"],
            ["Query logs", "Postgres query_logs table",    "Every RAG query: user, text, answered flag, latency_ms, source_ids"],
            ["Feedback",   "Postgres feedback table",      "Thumbs up/down + optional comment per answer via POST /feedback"],
        ],
        [28, 50, 102],
    )

    # =====================================================================
    # PAGE 7  MLOps
    # =====================================================================
    pdf.add_page()
    pdf.section("MLOps Lifecycle", "8")
    pdf.body(
        "Stratum's ML surface is retrieval + LLM inference, not a custom training loop. "
        "MLOps focuses on corpus versioning, ingestion pipeline management, evaluation, and deployment alignment."
    )
    pdf.ln(2)

    pdf.table(
        ["Stage", "Current Tooling", "Recommended Extension"],
        [
            ["1. Data",             "PDF corpus in data/raw/. File-hash dedup on ingest.",
             "DVC or LakeFS for regulatory reproducibility. S3 for corpus versioning."],
            ["2. Feature Eng.",     "LangGraph: extract->chunk->embed. 400t/80 overlap. all-MiniLM-L6-v2.",
             "Evaluate semantic/heading-aware chunking for long policy documents."],
            ["3. Evaluation",       "Offline: Ragas on eval_qa.json. Production: Langfuse traces. User: /feedback ratings.",
             "Wire evaluate_rag.py to nightly CI; alert if faithfulness < 0.80."],
            ["4. Deployment",       "Same Docker image as API. Models as singletons. RAG_WARMUP_ON_STARTUP=true.",
             "Changing EMBEDDING_MODEL requires full reindex - vector store and model must match."],
            ["5. Monitoring",       "Prometheus HTTP metrics. Grafana dashboards. Knowledge gap growth rate.",
             "Alert: faithfulness < 0.80, P95 > 10s, feedback < 65% positive, >20 new gaps/week."],
        ],
        [25, 82, 73],
    )

    pdf.h2("Ragas Evaluation Metrics")
    pdf.table(
        ["Metric", "Target", "Low Score Means", "Action"],
        [
            ["faithfulness",      "> 0.85", "LLM adding info not in context (hallucination)", "Strengthen system prompt; reduce TOP_K_FINAL"],
            ["answer_relevancy",  "> 0.80", "Answer does not address the question",           "Check chunking quality; improve embedding model"],
            ["context_recall",    "> 0.75", "Relevant chunks not being retrieved",            "Increase TOP_K_VECTOR/BM25; check model alignment"],
            ["context_precision", "> 0.70", "Retrieved chunks mostly irrelevant (noise)",     "Increase RERANKER_THRESHOLD; tune RRF k"],
        ],
        [42, 18, 72, 48],
    )

    pdf.h2("Pipeline Gaps and Enhancement Roadmap")
    pdf.table(
        ["Gap", "Priority", "Impact", "Suggested Fix"],
        [
            ["No query rewrite / HyDE",  "High", "Vague queries hurt recall",                 "LLM-based query expansion behind feature flag"],
            ["Fixed chunk windows",      "Med",  "Long policies split at bad boundaries",      "Heading-aware or semantic sentence splits"],
            ["No eval in CI",            "High", "Faithfulness regression caught too late",    "Wire evaluate_rag.py to nightly CI job"],
            ["Source diversity (MMR)",   "Med",  "Same PDF may fill all top-K slots",          "Post-rerank MMR or deduplicate by file_name"],
            ["No streaming responses",   "Low",  "Full response blocks until Groq returns",    "SSE streaming from Groq to SPA"],
        ],
        [46, 16, 64, 54],
    )

    # =====================================================================
    # PAGE 8  API Endpoints
    # =====================================================================
    pdf.add_page()
    pdf.section("API Endpoints Reference", "9")
    pdf.body("All endpoints under /api/v1. Swagger: http://localhost:8000/docs (disabled in production unless EXPOSE_API_DOCS=true).")
    pdf.ln(1)

    pdf.table(
        ["Method", "Path", "Auth", "Purpose"],
        [
            # health
            ["GET",      "/api/v1/ping",                         "Public",        "Health check"],
            # auth
            ["POST",     "/api/v1/auth/login",                   "Public",        "Email+password -> JWT + MFA step if enabled"],
            ["POST",     "/api/v1/auth/neon/exchange",           "Public",        "Neon Auth token -> Stratum JWT"],
            ["POST",     "/api/v1/auth/mfa/verify-login",        "Public",        "Complete MFA TOTP challenge"],
            ["POST",     "/api/v1/auth/refresh",                 "Cookie",        "Refresh access token via HttpOnly cookie"],
            ["POST",     "/api/v1/auth/logout",                  "Bearer",        "Invalidate refresh token + clear session"],
            ["GET",      "/api/v1/auth/me",                      "Bearer",        "Get current user profile + role"],
            ["PUT",      "/api/v1/auth/me",                      "Bearer",        "Update profile (name, bio, preferences)"],
            ["POST",     "/api/v1/auth/me/avatar",               "Bearer",        "Upload avatar (disk or S3)"],
            ["POST",     "/api/v1/auth/change-password",         "Bearer",        "Change own password"],
            ["POST",     "/api/v1/auth/mfa/setup",               "Bearer",        "Begin TOTP enrollment; returns QR URI"],
            ["POST",     "/api/v1/auth/mfa/confirm",             "Bearer",        "Confirm TOTP with first code"],
            ["POST",     "/api/v1/auth/mfa/disable",             "Bearer",        "Disable MFA (requires current TOTP)"],
            # knowledge - employee
            ["POST",     "/api/v1/chat",                         "Employee",      "Multi-turn conversational RAG with history"],
            ["POST",     "/api/v1/ask",                          "Employee",      "Single-turn RAG Q&A with source citations"],
            ["POST",     "/api/v1/search",                       "Employee",      "Hybrid search - no LLM generation"],
            ["POST",     "/api/v1/feedback",                     "Employee",      "Submit thumbs up/down rating"],
            ["GET",      "/api/v1/articles",                     "Employee",      "List published articles (paginated)"],
            ["GET",      "/api/v1/articles/{id}",                "Employee",      "Get article by ID"],
            ["GET",      "/api/v1/articles/{id}/pdf",            "Employee",      "Download source PDF for article"],
            ["GET/POST/DEL", "/api/v1/bookmarks",               "Employee",      "Manage saved articles"],
            # knowledge - admin
            ["POST",     "/api/v1/articles",                     "KnowledgeAdmin","Create new article (draft)"],
            ["PUT",      "/api/v1/articles/{id}",                "KnowledgeAdmin","Edit article content"],
            ["DELETE",   "/api/v1/articles/{id}",                "KnowledgeAdmin","Delete article"],
            ["POST",     "/api/v1/articles/{id}/submit-review",  "KnowledgeAdmin","Submit for review workflow"],
            ["POST",     "/api/v1/articles/{id}/approve",        "KnowledgeAdmin","Approve and publish"],
            ["POST",     "/api/v1/articles/{id}/archive",        "KnowledgeAdmin","Archive published article"],
            ["POST",     "/api/v1/admin/upload-pdf",             "SourcesAdmin",  "Upload PDF -> quality check -> ingest"],
            ["GET",      "/api/v1/admin/sources",                "SourcesAdmin",  "List all ingested PDF sources"],
            ["DELETE",   "/api/v1/admin/sources/raw/{file}",     "SourcesAdmin",  "Remove source PDF file"],
            ["POST",     "/api/v1/admin/reindex",                "SourcesAdmin",  "Trigger full LangGraph reindex"],
            ["GET/POST",  "/api/v1/admin/users",                 "SystemAdmin",   "List users / create new user"],
            ["PATCH",    "/api/v1/admin/users/{id}",             "SystemAdmin",   "Update user role or status"],
            ["DELETE",   "/api/v1/admin/users/{id}",             "SystemAdmin",   "Delete user (tombstoned)"],
            ["GET",      "/api/v1/analytics/summary",            "Admin",         "Usage stats and top queries"],
            ["GET",      "/api/v1/admin/knowledge-gaps",         "Admin",         "Unanswered query aggregation"],
            ["GET",      "/api/v1/admin/query-logs",             "Admin",         "Full query history"],
            ["GET",      "/api/v1/admin/audit-events",           "Admin",         "Security and admin event log"],
            ["GET",      "/api/v1/admin/feedback",               "Admin",         "All user answer ratings"],
            ["GET",      "/metrics",                             "Internal",      "Prometheus metrics scrape"],
        ],
        [18, 72, 28, 62],
    )

    # =====================================================================
    # PAGE 9  Tech Stack + Schema + Security
    # =====================================================================
    pdf.add_page()
    pdf.section("Full Tech Stack", "10")
    pdf.table(
        ["Layer", "Technology", "Purpose"],
        [
            ["Backend API",     "FastAPI 0.115+ + Uvicorn",               "Async HTTP, OpenAPI docs, middleware chain"],
            ["Python runtime",  "3.11+",                                   "Type-annotated; ruff/mypy enforced in CI"],
            ["Primary DB",      "PostgreSQL via Neon (serverless)",        "Users, articles, analytics, MFA; pooled connections"],
            ["Vector Store",    "ChromaDB (local persistent)",             "Cosine similarity; 384-dim embeddings"],
            ["Keyword Index",   "Whoosh BM25",                             "TF-IDF keyword index; rebuilt from Chroma on ingest"],
            ["Embeddings",      "all-MiniLM-L6-v2 (SentenceTransformers)", "384-dim dense vectors; CPU-friendly"],
            ["Reranker",        "BAAI/bge-reranker-base (CrossEncoder)",   "Pairwise relevance scoring; max_length=512"],
            ["LLM",             "Groq API - llama-3.3-70b-versatile",      "Grounded generation; banking system prompt"],
            ["Ingestion",       "LangGraph pipeline",                      "Typed state machine: extract->clean->chunk->embed->store"],
            ["Observability",   "Prometheus + Grafana + Langfuse",         "HTTP metrics, dashboards, LLM traces"],
            ["Auth",            "JWT HS256 + bcrypt + pyotp + Neon Auth",  "Password, MFA TOTP, Google SSO"],
            ["Frontend",        "React 19 + Vite 7 + Tailwind CSS v3",    "SPA, dark mode, react-router-dom v7"],
            ["Rate Limiting",   "SlowAPI + Redis",                         "200 req/min per IP; Redis-backed in production"],
            ["Containers",      "Docker + Docker Compose",                 "Dev and production multi-service stacks"],
            ["Orchestration",   "Kubernetes + Kustomize",                  "K8s base + production overlay; HPA support"],
            ["Infrastructure",  "Terraform",                               "Namespace provisioning + kube-prometheus-stack Helm"],
            ["CI/CD",           "GitHub Actions",                          "Lint, test, Docker build, Trivy, deploy on tag"],
            ["PDF extraction",  "pdfplumber",                              "Text + table extraction; quality tier assessment"],
            ["Eval framework",  "Ragas",                                   "Faithfulness, answer_relevancy, context metrics"],
        ],
        [34, 65, 81],
    )

    pdf.section("Database Schema", "11")
    pdf.table(
        ["Table", "Description"],
        [
            ["users",               "Identity, RBAC role, profile fields, bcrypt password, TOTP secret, lockout, refresh hash, neon_auth_sub"],
            ["deleted_users",       "Tombstone: blocks re-registration after admin delete"],
            ["articles",            "KM content: title, body (markdown), status, author_id, source PDF references"],
            ["article_versions",    "Full snapshot per edit: author, timestamp, body; retains history after status changes"],
            ["bookmarks",           "User <-> article many-to-many; created_at timestamp"],
            ["learning_paths",      "Curated content sequences: name, description, owner, visibility"],
            ["learning_path_items", "Articles/resources within a path: order, path_id, article_id"],
            ["user_progress",       "Per-user progress through learning paths: completed items, last_accessed"],
            ["expert_profiles",     "SME registry: domain, skills, contact, user_id FK"],
            ["query_logs",          "Every RAG query: user_id, query_text, answer, answered bool, latency_ms, source_ids, created_at"],
            ["feedback",            "User ratings: query_log_id FK, rating (+1/-1), comment, user_id, created_at"],
        ],
        [42, 138],
    )

    pdf.section("Security Posture", "12")
    pdf.table(
        ["Control", "Implementation"],
        [
            ["Transport",          "HTTPS everywhere. HSTS in production (max-age=31536000, includeSubDomains). Let's Encrypt / Certbot TLS."],
            ["Identity",           "JWT HS256 (15 min). HttpOnly refresh cookie (7 days). bcrypt passwords. pyotp TOTP MFA."],
            ["Authorization",      "RBAC dependency on every API route. 4 role levels. Portal routes gated in both API and SPA."],
            ["Input safety",       "Prompt injection guardrail + blocklist check before any RAG processing."],
            ["Output safety",      "PII regex masking on LLM output. Confidence threshold gate to prevent low-certainty hallucinations."],
            ["Security headers",   "X-Content-Type-Options: nosniff. X-Frame-Options: DENY. X-XSS-Protection. Referrer-Policy. Permissions-Policy. CSP default-src none."],
            ["Request limits",     "MAX_REQUEST_SIZE_MB (default 50 MB) enforced in middleware before route handlers run."],
            ["Rate limiting",      "SlowAPI 200 req/min per IP. Redis-backed in production (memory:// rejected in prod startup check)."],
            ["Secrets management", "No secrets in Git. K8s Secrets / env files on host only. gitleaks scans every CI push."],
            ["Container security", "Trivy CRITICAL CVE scan on every main-branch Docker build. Blocks merge on critical findings."],
            ["Code security",      "bandit SAST on Python code. ruff linting. Both enforced in CI."],
            ["API docs",           "Swagger/ReDoc disabled in ENVIRONMENT=production unless EXPOSE_API_DOCS=true."],
        ],
        [42, 138],
    )

    # =====================================================================
    # PAGE 10  Setup Reference
    # =====================================================================
    pdf.add_page()
    pdf.section("Quick Setup Reference", "13")

    pdf.h2("Minimum Required Secrets  (backend/.env.local)")
    pdf.kv("GROQ_API_KEY",    "gsk_...    (from console.groq.com)")
    pdf.kv("DATABASE_URL",    "postgresql+psycopg2://USER:PASS@HOST.neon.tech/neondb?sslmode=require")
    pdf.kv("JWT_SECRET_KEY",  "Generate with: openssl rand -hex 32   (must be >= 32 characters)")
    pdf.ln(3)

    pdf.h2("Local Development (step by step)")
    steps = [
        "pip install -r backend/requirements.txt   (from backend/ directory)",
        "npm install   (from repo root; installs concurrently for npm run dev)",
        "cp config/env/backend.env.local backend/.env.local  then fill in the 3 required secrets above",
        "cp config/env/frontend.vite.example frontend/.env  and set VITE_API_BASE=/api/v1",
        "npm run dev   (from repo root; starts FastAPI :8000 and Vite :5173 together)",
        'curl http://127.0.0.1:8000/api/v1/ping  ->  {"status":"ok","service":"stratum-api"}',
        "Open http://localhost:5173 in the browser",
    ]
    for i, s in enumerate(steps, 1):
        pdf.bullet(f"Step {i}: {s}")
    pdf.ln(3)

    pdf.h2("Ingest Documents into the Knowledge Base")
    pdf.bullet("Place PDF files in backend/data/raw/")
    pdf.bullet("cd backend  then  python -m ingestion.main")
    pdf.bullet("Pipeline: extract -> clean -> chunk (400t/80 overlap) -> embed -> ChromaDB + Whoosh rebuild")
    pdf.bullet("Admin reindex also available: POST /api/v1/admin/reindex (requires ENABLE_ADMIN_REINDEX=true)")
    pdf.ln(3)

    pdf.h2("Docker Production Stack")
    pdf.bullet("Create backend/.env from config/env/backend.env.prod (fill in all required secrets)")
    pdf.bullet("docker compose -f deploy/docker/docker-compose.yml up -d --build")
    pdf.bullet("Add  --profile observability  for Prometheus :9090 + Grafana :3000")
    pdf.ln(3)

    pdf.h2("Production Release via GitHub Actions")
    pdf.bullet("Merge to main -> CI must be green (ruff, mypy, bandit, pytest, ESLint, Trivy)")
    pdf.bullet("git tag v1.2.0 && git push origin v1.2.0  ->  triggers deploy.yml automatically")
    pdf.bullet("GitHub Actions: builds images -> pushes to GHCR -> SSH to EC2 -> deploy.sh -> smoke-test.sh")
    pdf.bullet("Rollback: export APP_TAG_PREVIOUS=v1.1.0; run deploy/docker/scripts/rollback.sh")
    pdf.ln(3)

    pdf.h2("Documentation Map")
    pdf.table(
        ["Document", "Contents"],
        [
            ["README.md",                        "Setup, endpoints, schema, contributing guide"],
            ["docs/HOW_IT_WORKS.md",             "Problem statement, product flows, RAG + auth + governance flows"],
            ["docs/system-design.md",            "Architecture Mermaid diagrams (10 diagrams across all layers)"],
            ["docs/RAG_PIPELINE.md",             "Pipeline audit, gaps, eval, configuration, enhancement roadmap"],
            ["docs/DEVOPS.md",                   "CI/CD pipeline, Docker, K8s, observability, security controls"],
            ["mlops/README.md",                  "MLOps lifecycle, Ragas eval, monitoring alerts, recommended extensions"],
            ["docs/POSTGRES_DATABASE.md",        "Neon setup, schema, MFA model details"],
            ["docs/AWS_EC2_PRODUCTION_GUIDE.md", "EC2 bootstrap, TLS, deploy, rollback, backup/restore SLOs"],
            ["config/SECRETS.md",                "Secret management patterns and full env var reference"],
            ["deploy/k8s/README.md",             "Kubernetes Kustomize deployment guide"],
            ["infra/terraform/README.md",        "Terraform namespace + kube-prometheus-stack bootstrap"],
        ],
        [82, 98],
    )

    # ── save ──────────────────────────────────────────────────────────────────
    out = Path("docs") / "Stratum_Architecture.pdf"
    pdf.output(str(out))
    return out


if __name__ == "__main__":
    p = build()
    print(f"PDF generated: {p}  ({p.stat().st_size // 1024} KB)")
