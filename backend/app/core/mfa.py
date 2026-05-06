"""
TOTP-based MFA (RFC 6238) — compatible with Google Authenticator, Authy, Microsoft Authenticator.
"""
import base64
import hashlib
import io
import secrets
from typing import Optional

import pyotp


ISSUER = "Stratum"
_WINDOW = 1  # ±30 s tolerance (1 step each side)


def generate_totp_secret() -> str:
    """Generate a cryptographically random base32 TOTP secret."""
    return pyotp.random_base32()


def get_provisioning_uri(secret: str, email: str) -> str:
    """Return the otpauth:// URI to encode in a QR code."""
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER)


def verify_totp(secret: str, code: str) -> bool:
    """Verify a 6-digit TOTP code with ±1 window tolerance."""
    if not secret or not code:
        return False
    code = code.strip().replace(" ", "")
    if not code.isdigit() or len(code) != 6:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=_WINDOW)


def generate_qr_png_b64(uri: str) -> str:
    """Render the provisioning URI as a PNG QR code, returned as base64."""
    try:
        import qrcode

        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_L, box_size=6, border=2)
        qr.add_data(uri)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        return ""


def generate_backup_codes(n: int = 8) -> list[str]:
    """Generate n single-use backup codes (plain text — hash before storing)."""
    return [secrets.token_hex(5).upper() for _ in range(n)]


def hash_backup_code(code: str) -> str:
    """SHA-256 hash a backup code for safe storage."""
    return hashlib.sha256(code.encode()).hexdigest()


def verify_backup_code(plain: str, stored_hashes: list[str]) -> Optional[str]:
    """
    Check if plain code matches any stored hash.
    Returns the matched hash so the caller can remove it (single-use).
    """
    h = hash_backup_code(plain.strip().upper())
    return h if h in stored_hashes else None
