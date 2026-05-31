"""
Cryptographic Utilities for Anti-Hoax Civic Alert Gateway
=========================================================
Provides SHA-256 hashing, integrity verification, and timestamp signing
for civic alerts. Every alert is cryptographically signed so citizens
can verify that the information has not been tampered with.
"""

import hashlib
import hmac
import json
import time
from datetime import datetime, timezone


# In production this would be loaded from environment / secrets manager.
_SIGNING_KEY = b"anti-hoax-civic-alert-gateway-signing-key-v1"


def generate_alert_hash(alert_data: dict) -> str:
    """
    Generate a deterministic SHA-256 hash for an alert's core fields.

    The hash covers: title, description, source, severity, category,
    issued_at, and expires_at.  This ensures that any modification to
    these fields will produce a different hash, making tampering
    detectable.

    Args:
        alert_data: Dictionary containing the alert fields.

    Returns:
        Hex-encoded SHA-256 digest string.
    """
    canonical = _canonical_payload(alert_data)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def verify_alert_hash(alert_data: dict, expected_hash: str) -> bool:
    """
    Verify that an alert's SHA-256 hash matches the expected value.

    Args:
        alert_data:     Dictionary containing the alert fields.
        expected_hash:  The hash string to compare against.

    Returns:
        True if the computed hash matches *expected_hash*, False otherwise.
    """
    computed = generate_alert_hash(alert_data)
    # Constant-time comparison to avoid timing side-channels.
    return hmac.compare_digest(computed, expected_hash)


def sign_timestamp(timestamp_str: str) -> str:
    """
    Create an HMAC-SHA256 signature for a timestamp string.

    This allows the gateway to prove that a particular timestamp was
    issued by an authorised source.

    Args:
        timestamp_str: ISO-8601 formatted timestamp.

    Returns:
        Hex-encoded HMAC-SHA256 signature.
    """
    return hmac.new(
        _SIGNING_KEY,
        timestamp_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_timestamp_signature(timestamp_str: str, signature: str) -> bool:
    """
    Verify a timestamp's HMAC-SHA256 signature.

    Args:
        timestamp_str: ISO-8601 formatted timestamp.
        signature:     The HMAC hex digest to verify.

    Returns:
        True if the signature is valid, False otherwise.
    """
    expected = sign_timestamp(timestamp_str)
    return hmac.compare_digest(expected, signature)


def generate_verification_proof(alert_data: dict) -> dict:
    """
    Build a complete cryptographic proof bundle for an alert.

    The proof includes:
      - The alert hash
      - A signed verification timestamp
      - The hash algorithm used
      - An integrity-verified flag

    Args:
        alert_data: Dictionary containing the alert fields.

    Returns:
        Dictionary with proof metadata.
    """
    alert_hash = alert_data.get("sha256_hash") or generate_alert_hash(alert_data)
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "alert_hash": alert_hash,
        "hash_algorithm": "SHA-256",
        "verified_at": now_iso,
        "timestamp_signature": sign_timestamp(now_iso),
        "integrity_verified": verify_alert_hash(alert_data, alert_hash),
    }


# ── internal helpers ────────────────────────────────────────────────
def _canonical_payload(alert_data: dict) -> str:
    """
    Produce a deterministic JSON string from the alert's core fields.

    Keys are sorted and separators are compact so the same logical
    alert always yields the same byte sequence.
    """
    core_fields = {
        "title": alert_data.get("title", ""),
        "description": alert_data.get("description", ""),
        "source": alert_data.get("source", ""),
        "severity": alert_data.get("severity", ""),
        "category": alert_data.get("category", ""),
        "issued_at": alert_data.get("issued_at", ""),
        "expires_at": alert_data.get("expires_at", ""),
    }
    return json.dumps(core_fields, sort_keys=True, separators=(",", ":"))
