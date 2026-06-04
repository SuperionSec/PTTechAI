import pytest
from passlib.hash import sha256_crypt

import backend.models  # noqa: F401
from backend.common.infra.auth import get_password_hash, identify_hash, password_needs_rehash, verify_password


def test_new_password_hash_uses_native_bcrypt():
    hashed = get_password_hash("StrongPassword123")
    assert identify_hash(hashed) == "bcrypt"
    assert verify_password("StrongPassword123", hashed)
    assert not verify_password("wrong", hashed)
    assert not password_needs_rehash(hashed)


def test_legacy_sha256_crypt_hash_is_supported_and_needs_rehash():
    legacy_hash = sha256_crypt.hash("StrongPassword123")
    assert identify_hash(legacy_hash) == "sha256_crypt"
    assert verify_password("StrongPassword123", legacy_hash)
    assert not verify_password("wrong", legacy_hash)
    assert password_needs_rehash(legacy_hash)


def test_unknown_hash_is_rejected():
    assert identify_hash("not-a-real-hash") == "unknown"
    assert not verify_password("StrongPassword123", "not-a-real-hash")
    assert password_needs_rehash("not-a-real-hash")
