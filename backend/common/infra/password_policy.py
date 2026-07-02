"""
Password policy validation.

Centralizes password-strength rules so registration, admin user creation,
password change, and reset all enforce the same policy (RuoYi-style: length +
character-class requirements + common-password blacklist).
"""
from __future__ import annotations

import re

# Minimum length. bcrypt only uses the first 72 bytes; we cap upstream at the
# schema layer, here we only enforce a lower bound.
MIN_LENGTH = 8
MAX_LENGTH = 72

# A small blacklist of the most common weak passwords. Kept intentionally short;
# the character-class rules already reject most of these, this is a safety net.
COMMON_PASSWORDS = {
    "password", "password1", "password123", "12345678", "123456789",
    "qwerty123", "admin123", "abc12345", "11111111", "iloveyou",
    "letmein1", "welcome1", "changeme", "passw0rd", "p@ssw0rd",
    "administrator", "adminadmin", "root1234", "test1234",
}

# Require at least three of the four character classes for a strong password.
_LOWER = re.compile(r"[a-z]")
_UPPER = re.compile(r"[A-Z]")
_DIGIT = re.compile(r"\d")
_SPECIAL = re.compile(r"[^A-Za-z0-9]")


class PasswordPolicyError(ValueError):
    """Raised when a password does not satisfy the policy."""


def describe_policy() -> str:
    """Human-readable policy description (for API errors / UI hints)."""
    return (
        f"Password must be {MIN_LENGTH}-{MAX_LENGTH} characters and include at "
        "least three of: lowercase, uppercase, digit, special character; "
        "common/guessable passwords are rejected."
    )


def validate_password(password: str, *, email: str | None = None) -> None:
    """Validate a plaintext password against the policy.

    Raises PasswordPolicyError with a user-facing message on failure.
    """
    if password is None or not isinstance(password, str):
        raise PasswordPolicyError("Password is required")
    if len(password) < MIN_LENGTH:
        raise PasswordPolicyError(f"Password must be at least {MIN_LENGTH} characters")
    if len(password) > MAX_LENGTH:
        raise PasswordPolicyError(f"Password must be at most {MAX_LENGTH} characters")

    classes = sum(bool(p.search(password)) for p in (_LOWER, _UPPER, _DIGIT, _SPECIAL))
    if classes < 3:
        raise PasswordPolicyError(
            "Password must include at least three of: lowercase, uppercase, "
            "digit, special character"
        )

    lowered = password.lower()
    if lowered in COMMON_PASSWORDS:
        raise PasswordPolicyError("This password is too common; choose a stronger one")

    # Reject passwords that are just the local-part of the email.
    if email:
        local = email.split("@", 1)[0].lower()
        if local and len(local) >= 4 and local in lowered:
            raise PasswordPolicyError("Password must not contain your email name")


def is_valid_password(password: str, *, email: str | None = None) -> bool:
    try:
        validate_password(password, email=email)
        return True
    except PasswordPolicyError:
        return False
