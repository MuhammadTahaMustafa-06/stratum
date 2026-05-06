"""
Guardrails: input validation, output safety, PII masking, confidence scoring.
Guards against OWASP A03 (injection via prompt) and AI hallucination.
"""
import math
import re
from typing import Any, Dict, List, Tuple

# ── Prompt injection patterns (OWASP A03 / LLM-specific) ─────────────────────
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior)\s+(instructions?|context|prompt)",
    r"forget\s+(everything|all|your|context|instructions?)",
    r"you\s+are\s+now\s+(a\s+)?(?!stratum)",
    r"act\s+as\s+(if\s+you\s+(are|were)\s+)?(?!stratum)",
    r"system\s*prompt",
    r"reveal\s+(your\s+)?(instructions?|system|prompt|training)",
    r"jailbreak",
    r"dan\s+mode",
    r"\bdo\s+anything\s+now\b",
    r"override\s+(your\s+)?(guidelines?|restrictions?|instructions?)",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)

# ── PII patterns to mask in output ────────────────────────────────────────────
_PII_PATTERNS = [
    (re.compile(r"\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b"), "XXXX-XXXX-XXXX-XXXX"),  # card
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "XXX-XX-XXXX"),                              # SSN
    (re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,27}\b"), "[IBAN REDACTED]"),               # IBAN
    (re.compile(r"\b\d{8,12}\b"), "[ACCOUNT# REDACTED]"),                                # long numbers
]

# ── Query length limits ────────────────────────────────────────────────────────
_MAX_QUERY_CHARS = 2000
_MIN_QUERY_CHARS = 2


class GuardrailService:

    @staticmethod
    def validate_input(query: str) -> bool:
        """
        Block prompt injection, oversized payloads, and empty inputs.
        Returns True if the query is safe to process.
        """
        if not query or not query.strip():
            return False
        if len(query) < _MIN_QUERY_CHARS:
            return False
        if len(query) > _MAX_QUERY_CHARS:
            return False
        if _INJECTION_RE.search(query):
            return False
        return True

    @staticmethod
    def _mask_pii(text: str) -> str:
        for pattern, replacement in _PII_PATTERNS:
            text = pattern.sub(replacement, text)
        return text

    @staticmethod
    def validate_output(
        answer: str,
        avg_reranker_score: float,
        threshold: float = -5.0,
    ) -> Tuple[bool, str]:
        """
        Guard against low-confidence answers and mask PII in output.
        Returns (is_valid, cleaned_answer).
        """
        if avg_reranker_score < threshold:
            return False, GuardrailService.low_confidence_fallback("")

        cleaned = GuardrailService._mask_pii(answer) if answer else answer
        return True, cleaned

    @staticmethod
    def low_confidence_fallback(query: str) -> str:  # noqa: ARG004
        return (
            "I don't have enough high-confidence information in the knowledge base to answer this accurately. "
            "Try rephrasing with specific module or process keywords, or contact a domain expert."
        )

    @staticmethod
    def calculate_confidence(retrieved_chunks: List[Dict[str, Any]]) -> float:
        """Sigmoid-normalised confidence score in [0, 1]."""
        if not retrieved_chunks:
            return 0.0
        scores = [c.get("reranker_score", -10.0) for c in retrieved_chunks]
        avg = sum(scores) / len(scores)
        return min(max(1 / (1 + math.exp(-avg / 2.0)), 0.0), 1.0)
