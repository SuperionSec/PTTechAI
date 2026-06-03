# RBAC and Permissions

## Permission model

Permissions are defined as `permission.name` strings, e.g. `vuln_library:read`. Database scopes and actions are stored as enums.

## Role system

System uses only one persistent role model:

- `RoleModel` table with name, display_name, permissions.
- `User.role_id` references `RoleModel.id`.
- `RolePermission.role_id` references `RoleModel.id`.

Legacy `users.role` and `role_permissions.role` columns have been removed.

## Resource mapping

Each permission can be mapped to:

- Frontend page paths → route access control
- Backend API paths → endpoint access control

Mappings are cached for 300 seconds and invalidated on create/delete.

## Permission name check

Common helpers:

- `has_permission_name(db, user, permission_name)` → bool
- `require_permission_name(permission_name)` → FastAPI dependency

Vulnerability library uses these helpers for its `vuln_library:*` permissions. The `vuln_library:read_exp` permission is checked inside endpoint logic, not via URL resource mapping.

## Menus

Frontend menu generation uses RBAC FRONTEND_ROUTES and user permissions. Dead/static Sidebar fallback exists for API-failure scenarios but is kept minimal.