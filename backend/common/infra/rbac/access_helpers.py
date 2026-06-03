from backend.common.models.permission import RolePermission
from backend.common.models.user import User


def role_name_for(user: User) -> str | None:
    return user.role


def is_admin_role(user: User) -> bool:
    return role_name_for(user) == "admin"


def is_service_role(user: User) -> bool:
    return role_name_for(user) == "service"


def role_permission_filter(user: User):
    return RolePermission.role_id == user.role_id
