#!/usr/bin/env python3
"""
Generate internal banking-domain PDFs for the raw ingest folder (RAG / Knowledge Hub).

Usage (from backend/):
  pip install fpdf2
  python tools/generate_knowledge_pdfs.py

Output: backend/data/raw/*.pdf (paths follow app.core.config settings.data_dir)
"""
from __future__ import annotations

import sys
from pathlib import Path

# Allow running as `python tools/generate_knowledge_pdfs.py` from backend/
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    from fpdf import FPDF
except ImportError:
    print("Install fpdf2: pip install fpdf2", file=sys.stderr)
    sys.exit(1)

from app.core.config import settings  # noqa: E402


class Doc(FPDF):
    def header(self) -> None:
        self.set_font("Helvetica", "B", 10)
        self.set_x(self.l_margin)
        self.cell(0, 8, "Stratum Internal Knowledge - Banking Software Division", new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.cell(0, 8, f"Page {self.page_no()}", align="C")

    def chapter_title(self, title: str) -> None:
        self.set_font("Helvetica", "B", 14)
        self.multi_cell(0, 8, title)
        self.ln(4)

    def body_text(self, paragraphs: list[str]) -> None:
        self.set_font("Helvetica", "", 11)
        for p in paragraphs:
            self.multi_cell(0, 6, p)
            self.ln(3)


DOCUMENTS: list[tuple[str, list[str]]] = [
    (
        "KM-01-Payments-SEPA-Overview.pdf",
        [
            "Payments & SEPA - Employee Guide",
            "This document helps engineers and analysts understand how our payment rails relate to customer-facing banking products.",
            (
                "SEPA Credit Transfer (SCT) is the dominant euro payment scheme for retail and corporate transfers. "
                "Our platform maps internal payment orders to ISO 20022 pain.001 messages for initiation and pain.002 for status. "
                "Cut-off times are bank-specific: always check the product calendar before promising same-day value."
            ),
            (
                "SEPA Instant (SCT Inst) provides up to 100,000 EUR per transaction with funds availability in seconds. "
                "Not all participant banks support full reach; use the directory service to validate creditor BIC capabilities."
            ),
            (
                "Day-to-day tasks: verify IBAN with MOD-97 check, validate BIC where required, ensure purpose codes align with "
                "AML monitoring rules, and attach end-to-end ID (UETR) for tracking when the channel supports SWIFT gpi."
            ),
        ],
    ),
    (
        "KM-02-Core-Banking-Glossary.pdf",
        [
            "Core Banking Glossary for Application Teams",
            "Use this glossary when reading specs, incidents, or regulatory mail.",
            (
                "General Ledger (GL): system of record for balances and postings. Sub-ledgers (e.g. loans, deposits) roll up to GL."
            ),
            (
                "Chart of Accounts: hierarchical structure of accounts; changes require finance approval and migration windows."
            ),
            (
                "NOSTRO/VOSTRO: our bank's account at a correspondent vs. their account at us - critical for reconciliation."
            ),
            (
                "EOD/BOD: end-of-day and beginning-of-day batch windows. No structural releases during batch unless approved."
            ),
            (
                "Interest accrual vs. interest application: accrual posts daily economic cost; application realizes cash movement."
            ),
        ],
    ),
    (
        "KM-03-Release-Change-Banking-Apps.pdf",
        [
            "Release & Change Management - Niche Banking Software",
            "Our customers run regulated environments; changes must be traceable and reversible.",
            (
                "All production deploys require a change ticket, peer review, and CAB approval for high-risk windows (month-end, tax season)."
            ),
            (
                "Blue/green or canary patterns are preferred for API gateways. Database migrations must be backward compatible for one release."
            ),
            (
                "Feature flags: default off in production until KM documentation and support macros are published in Stratum."
            ),
            (
                "Rollback: keep previous container images and DB migration down scripts validated in staging before go-live."
            ),
        ],
    ),
    (
        "KM-04-AML-KYC-Developer-Primer.pdf",
        [
            "AML / KYC - What Developers Need to Know",
            "You are not compliance officers, but you implement controls they design.",
            (
                "Customer Due Diligence (CDD): identity verification, risk scoring, and periodic refresh. APIs must not bypass screening services."
            ),
            (
                "Transaction monitoring: typologies (structuring, rapid movement) trigger alerts. Never log full PAN; use tokens."
            ),
            (
                "Sanctions screening: OFAC/EU lists update frequently; batch and real-time calls must handle timeouts gracefully."
            ),
            (
                "If you build onboarding flows, preserve audit trails: who changed risk level, when, and from which source system."
            ),
        ],
    ),
    (
        "KM-05-Incident-Response-Runbook.pdf",
        [
            "Incident Response - Payments & Core APIs",
            "Use this runbook during sev1/sev2 incidents affecting money movement or customer channels.",
            (
                "Triage: confirm scope (single tenant vs. region), check status page dependencies, pull last successful deployment time."
            ),
            (
                "Communications: incident commander coordinates with Legal and Comms before external messaging."
            ),
            (
                "Data: capture structured logs, trace IDs, and sample correlation IDs for post-incident review within 5 business days."
            ),
            (
                "Recovery: prefer fail-safe modes (queue holds, read-only) over partial debit without matching credit."
            ),
        ],
    ),
    (
        "KM-06-Treasury-API-Integration.pdf",
        [
            "Treasury & Cash Management - API Integration Patterns",
            "Helps integration engineers work with corporate banking APIs safely.",
            (
                "Idempotency-Key headers are mandatory for payment initiation to prevent duplicate settlement on retries."
            ),
            (
                "Webhooks: verify signatures with the bank-published JWKS; rotate keys per security bulletin."
            ),
            (
                "Pagination: cursor-based for large statement extracts; respect rate limits to avoid throttling during EOD peaks."
            ),
            (
                "Test data: use sandbox BICs/IBANs only; never point integration tests at production endpoints with real credentials."
            ),
        ],
    ),
    (
        "KM-07-Loan-Origination-Lifecycle.pdf",
        [
            "Loan Origination - Lifecycle Overview for IT Staff",
            "Understand stages from application to disbursement for better support and testing.",
            (
                "Stages: application capture, credit decision, documentation, collateral registration, booking, disbursement, and servicing handoff."
            ),
            (
                "Regulatory checks (affordability, stress) may vary by jurisdiction; feature toggles must respect tenant configuration."
            ),
            (
                "Day-to-day: when debugging, confirm product code, interest rate type (fixed/floating), and amortization schedule version."
            ),
        ],
    ),
    (
        "KM-08-Team-Tribal-Knowledge-Handover.pdf",
        [
            "Team Knowledge - Handover Practices",
            "Tribal knowledge belongs in Stratum, not only in chat threads.",
            (
                "After each release, update runbooks and decision records (ADR) linked from the Knowledge Hub."
            ),
            (
                "Pairing sessions for domain experts: record glossary deltas and acronym expansions for new hires."
            ),
            (
                "Use domain tags (payments, lending, compliance) consistently so search and RAG retrieval stay accurate."
            ),
        ],
    ),
]


def main() -> None:
    raw_dir = Path(settings.data_dir).resolve()
    if not raw_dir.is_absolute():
        raw_dir = (BACKEND_ROOT / settings.data_dir).resolve()
    raw_dir.mkdir(parents=True, exist_ok=True)

    for filename, parts in DOCUMENTS:
        title = parts[0]
        body = parts[1:]

        pdf = Doc()
        pdf.set_auto_page_break(auto=True, margin=18)
        pdf.add_page()
        pdf.chapter_title(title)
        pdf.body_text(body)

        out = raw_dir / filename
        pdf.output(str(out))
        print(f"Wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
