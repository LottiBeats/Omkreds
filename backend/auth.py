"""
auth.py  —  Clerk JWT verification for StructuralCalc

Clerk manages all users, passwords, and sessions.
This module only verifies that an incoming Bearer token was issued by Clerk.

Environment variables
─────────────────────
CLERK_ISSUER  — your Clerk Frontend API URL, found in the Clerk dashboard
                under "API Keys" → "Clerk API URL".
                Examples:
                  Development: https://fond-panda-42.clerk.accounts.dev
                  Production:  https://clerk.yourdomain.com

How token verification works
─────────────────────────────
1. Clerk signs JWTs with RS256 (RSA + SHA-256).
2. Clerk publishes its public keys at {CLERK_ISSUER}/.well-known/jwks.json.
3. We fetch those keys once (cached for 1 hour), pick the right one by `kid`,
   and verify the token's signature with python-jose.
4. The payload contains `sub` (Clerk user ID), `email`, and other user claims.
"""

import os
import time
import threading

import httpx
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# ── Configuration ────────────────────────────────────────────────────────────

CLERK_ISSUER: str = os.environ.get("CLERK_ISSUER", "").rstrip("/")

_bearer = HTTPBearer(auto_error=True)

# ── JWKS cache (refreshed every hour) ────────────────────────────────────────

_CACHE_TTL = 3600   # seconds
_jwks_lock = threading.Lock()
_jwks_data: dict | None = None
_jwks_fetched_at: float = 0.0


def _get_jwks() -> dict:
    """Return Clerk's public JWKS, refreshing the cache if stale."""
    global _jwks_data, _jwks_fetched_at
    now = time.monotonic()
    with _jwks_lock:
        if _jwks_data is None or (now - _jwks_fetched_at) > _CACHE_TTL:
            if not CLERK_ISSUER:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="CLERK_ISSUER environment variable is not set",
                )
            url = f"{CLERK_ISSUER}/.well-known/jwks.json"
            try:
                resp = httpx.get(url, timeout=10)
                resp.raise_for_status()
                _jwks_data = resp.json()
                _jwks_fetched_at = now
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Could not fetch Clerk public keys: {exc}",
                )
    return _jwks_data


# ── Token verification ────────────────────────────────────────────────────────

def verify_clerk_token(token: str) -> dict:
    """
    Verify a Clerk JWT.

    Returns the decoded payload on success.
    Raises HTTPException 401 if the token is invalid or expired.
    """
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Malformed token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    kid = header.get("kid")
    jwks = _get_jwks()
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)

    if key is None:
        # Try refreshing JWKS in case Clerk rotated keys
        global _jwks_fetched_at
        with _jwks_lock:
            _jwks_fetched_at = 0.0   # force refresh
        jwks = _get_jwks()
        key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)

    if key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token signing key not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            options={"verify_aud": False},   # Clerk doesn't set aud by default
            issuer=CLERK_ISSUER or None,
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


# ── FastAPI dependency ────────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """
    FastAPI dependency — verifies the Clerk Bearer token and returns
    a simple user dict with id, email, and name.

    Usage:
        @router.get("/some-route")
        def handler(user = Depends(get_current_user)):
            user["email"]  # e.g. "niels@example.com"
            user["id"]     # Clerk user_id, e.g. "user_2abc..."
    """
    payload = verify_clerk_token(credentials.credentials)

    # Clerk puts the user's primary email in `email` if you include it in the
    # JWT template, otherwise you get it from `email_addresses[0]` via the API.
    # The `sub` claim is always the Clerk user ID.
    return {
        "id":    payload.get("sub", ""),
        "email": payload.get("email", ""),
        "name":  payload.get("name", ""),
    }
