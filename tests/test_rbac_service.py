import pytest
from fastapi import HTTPException

from backend.services.rbac_service import _normalize_role_name


def test_normalize_role_name_lowercases_and_trims():
    assert _normalize_role_name("  Auditor_1  ") == "auditor_1"


@pytest.mark.parametrize("role_name", ["", "../admin", "admin/user", "admin-user", "admin user", "管理员", "a" * 51])
def test_normalize_role_name_rejects_invalid_values(role_name):
    with pytest.raises(HTTPException) as exc_info:
        _normalize_role_name(role_name)
    assert exc_info.value.status_code == 400
