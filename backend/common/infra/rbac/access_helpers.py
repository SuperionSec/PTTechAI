from backend.common.models.permission import RolePermission
from backend.common.models.user import Role, User


def role_name_for(user_or_role) -> str:
    role = getattr(user_or_role, "role", user_or_role)
    return role.value if hasattr(role, "value") else role


def is_admin_role(user_or_role) -> bool:
    return role_name_for(user_or_role) == Role.ADMIN.value


def role_permission_filter(user: User):
    role_name = role_name_for(user)
    if user.role_id:
        return (RolePermission.role_id == user.role_id) | (RolePermission.role == role_name)
    return RolePermission.role == role_name
