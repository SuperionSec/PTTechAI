import pytest
from fastapi import HTTPException

from backend.schemas.rbac import RoleUpdate
from backend.services.rbac_service import _normalize_role_name, resolve_active_role, update_role


class FakeDb:
    def __init__(self, scalar_value):
        self.scalar_value = scalar_value
        self.committed = False

    async def scalar(self, _query):
        return self.scalar_value

    async def commit(self):
        self.committed = True


class FakeRoleModel:
    def __init__(self, name="admin", is_system=True, is_active=True):
        self.id = "role-id"
        self.name = name
        self.display_name = "Administrator"
        self.description = None
        self.is_system = is_system
        self.is_active = is_active


def test_normalize_role_name_lowercases_and_trims():
    assert _normalize_role_name("  Auditor_1  ") == "auditor_1"
    assert _normalize_role_name("SECURITY_TEAM") == "security_team"


@pytest.mark.parametrize("role_name", ["", "../admin", "admin/user", "admin-user", "admin user", "管理员", "a" * 51, "admin%2Fuser"])
def test_normalize_role_name_rejects_invalid_values(role_name):
    with pytest.raises(HTTPException) as exc_info:
        _normalize_role_name(role_name)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_update_role_rejects_deactivating_system_role():
    db = FakeDb(FakeRoleModel())

    with pytest.raises(HTTPException) as exc_info:
        await update_role(db, "ADMIN", RoleUpdate(is_active=False))

    assert exc_info.value.status_code == 403
    assert not db.committed


@pytest.mark.asyncio
async def test_resolve_active_role_defaults_to_user_role():
    db = FakeDb(FakeRoleModel(name="user", is_system=True, is_active=True))

    role_model = await resolve_active_role(db, None)

    assert role_model.name == "user"


@pytest.mark.asyncio
async def test_resolve_active_role_rejects_missing_role():
    db = FakeDb(None)

    with pytest.raises(HTTPException) as exc_info:
        await resolve_active_role(db, "unknown")

    assert exc_info.value.status_code == 400
