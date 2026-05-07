"""
PostgreSQL connection helpers: optional DNS-over-HTTPS and startup error text.

When the OS resolver cannot resolve the DB hostname (VPN, ISP DNS, IPv6-only host, etc.) but HTTPS
works, ``DATABASE_DNS_FALLBACK=true`` resolves via Cloudflare then Google DoH (A then AAAA) and sets
libpq ``hostaddr`` while keeping the original hostname in the URL for TLS verification.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from sqlalchemy.engine.url import make_url
from sqlalchemy.exc import OperationalError

from app.core.config import settings

_log = logging.getLogger(__name__)

_CLOUDFLARE_DOH = "https://1.1.1.1/dns-query"
_GOOGLE_DOH = "https://dns.google/resolve"
_DEFAULT_CONNECT_TIMEOUT_SEC = 15
_DOH_TIMEOUT_SEC = 10


def _doh_query_cloudflare(hostname: str, rrtype: str) -> dict | None:
    """Run a single Cloudflare DoH query; return parsed JSON or None."""
    query = urllib.parse.urlencode({"name": hostname, "type": rrtype})
    request = urllib.request.Request(
        f"{_CLOUDFLARE_DOH}?{query}",
        headers={"Accept": "application/dns-json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=_DOH_TIMEOUT_SEC) as response:  # nosec B310
            return json.loads(response.read().decode())
    except (OSError, ValueError) as err:
        _log.debug("Cloudflare DoH %s lookup failed for %s: %s", rrtype, hostname, err)
        return None


def _doh_query_google(hostname: str, rrtype: str) -> dict | None:
    """Google Public DNS JSON API (same Answer layout as Cloudflare dns-json)."""
    query = urllib.parse.urlencode({"name": hostname, "type": rrtype})
    request = urllib.request.Request(
        f"{_GOOGLE_DOH}?{query}",
        headers={"Accept": "application/dns-json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=_DOH_TIMEOUT_SEC) as response:  # nosec B310
            return json.loads(response.read().decode())
    except (OSError, ValueError) as err:
        _log.debug("Google DoH %s lookup failed for %s: %s", rrtype, hostname, err)
        return None


def _first_answer_data(payload: dict, type_id: int) -> str | None:
    for answer in payload.get("Answer") or []:
        if int(answer.get("type", 0)) == type_id and answer.get("data"):
            return str(answer["data"]).strip()
    return None


def _resolve_ip_via_doh(hostname: str) -> tuple[str, str, str] | None:
    """
    Return (ip, family, resolver) for libpq hostaddr.

    Tries A then AAAA on Cloudflare, then A then AAAA on Google (some networks block 1.1.1.1).

    Some managed Postgres hosts are **IPv6-only** in public DNS (no A record). The OS resolver
    may also fail on IPv4-only Windows setups; libpq still needs a numeric hostaddr to avoid
    getaddrinfo() on the hostname.
    """
    attempts: tuple[tuple[str, str, int, str], ...] = (
        ("cloudflare", "A", 1, "ipv4"),
        ("cloudflare", "AAAA", 28, "ipv6"),
        ("google", "A", 1, "ipv4"),
        ("google", "AAAA", 28, "ipv6"),
    )
    doh_fns = {"cloudflare": _doh_query_cloudflare, "google": _doh_query_google}
    for resolver_name, rrtype, type_id, family in attempts:
        payload = doh_fns[resolver_name](hostname, rrtype)
        if not payload:
            continue
        data = _first_answer_data(payload, type_id)
        if data:
            return (data, family, resolver_name)
    return None


def libpq_connect_args(database_url: str) -> dict[str, object]:
    """Build psycopg2/libpq ``connect_args`` for SQLAlchemy ``create_engine``."""
    args: dict[str, object] = {"connect_timeout": _DEFAULT_CONNECT_TIMEOUT_SEC}

    override = (settings.database_hostaddr or "").strip()
    if override:
        args["hostaddr"] = override
        fam = "ipv6" if ":" in override else "ipv4"
        try:
            parsed = make_url(database_url)
            host = parsed.host or "?"
        except ValueError:
            host = "?"
        _log.warning(
            "Using DATABASE_HOSTADDR override: %s (%s); TLS still uses hostname %s.",
            override,
            fam,
            host,
        )
        return args

    if not settings.database_dns_fallback:
        return args

    try:
        parsed = make_url(database_url)
    except ValueError:
        return args

    host = parsed.host
    if not host:
        return args

    resolved = _resolve_ip_via_doh(host)
    if resolved:
        ip, family, resolver_name = resolved
        args["hostaddr"] = ip
        _log.warning(
            "Using DATABASE_DNS_FALLBACK (%s DoH): %s → %s (%s); TLS still uses hostname %s.",
            resolver_name,
            host,
            ip,
            family,
            host,
        )
    else:
        _log.warning(
            "DATABASE_DNS_FALLBACK is enabled but DoH (Cloudflare + Google) returned no A/AAAA for %s; "
            "connecting by hostname only.",
            host,
        )
    return args


def is_dns_resolution_failure(exc: OperationalError) -> bool:
    """True when the driver error indicates hostname resolution failed."""
    raw = exc.orig if getattr(exc, "orig", None) is not None else exc
    text = str(raw).lower()
    markers = (
        "could not translate host name",
        "name or service not known",
        "temporary failure in name resolution",
        "nodename nor servname provided",
    )
    return any(m in text for m in markers)


def startup_connection_error_message(exc: OperationalError) -> str:
    """Single clear message for RuntimeError when the app cannot connect during lifespan."""
    core = (
        "PostgreSQL is unreachable. Check DATABASE_URL against your host's dashboard (e.g. Neon), "
        "network/VPN, SSL params, and credentials."
    )
    if is_dns_resolution_failure(exc):
        return (
            f"{core} "
            "This matches DNS failure or a wrong hostname in DATABASE_URL. "
            "Try DATABASE_DNS_FALLBACK=true (resolves A and AAAA via DoH), fix VPN/DNS, enable IPv6 if the DB is IPv6-only, "
            "or use your provider's pooled connection string if offered. "
            f"Driver: {exc.orig or exc}"
        )
    return f"{core} Driver: {exc.orig or exc}"
