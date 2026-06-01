from fastapi import APIRouter, Depends, Request, status, Body
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.infra.auth import get_current_user, require_role
from backend.common.infra.resource_guard import resource_guard
from backend.common.db.database import get_db
from backend.common.models.user import Role, User
from backend.common.schemas.rbac import (
    PermissionOut,
    RbacMeOut,
    ResourceMappingCreate,
    ResourceMappingOut,
    RoleCreate,
    RoleDetailOut,
    RolePermissionsUpdate,
    RoleSummaryOut,
    RoleUpdate,
    UnmappedResourceOut,
)
from backend.system.rbac import service as rbac_service
from backend.system.audit.service import record_audit_log

router = APIRouter()


@router.get("/me", response_model=RbacMeOut)
async def get_my_rbac_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    permissions = await rbac_service.get_user_permission_names(db, current_user)
    frontend_pages = await resource_guard.get_accessible_pages(current_user, db)
    backend_apis = await resource_guard.get_accessible_apis(current_user, db)
    return RbacMeOut(
        role=role,
        permissions=permissions,
        frontend_pages=frontend_pages,
        backend_apis=backend_apis,
        access=rbac_service.build_access_map(permissions, role),
        menus=rbac_service.build_menu_items(permissions, frontend_pages, role),
    )


@router.get("/frontend-config", response_model=RbacMeOut)
async def get_frontend_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_my_rbac_profile(db, current_user)


@router.get("/permissions", response_model=list[PermissionOut])
async def list_permissions(
    scope: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    return await rbac_service.list_permissions(db, scope)


@router.get("/roles", response_model=list[RoleSummaryOut])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    return await rbac_service.list_roles(db)


@router.post("/roles", response_model=RoleDetailOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    result = await rbac_service.create_role(db, body)
    await record_audit_log(db, user=current_user, action="role.create", resource_type="role", resource_id=result.id or result.role, details={"role": result.role}, request=request)
    await db.commit()
    return result


@router.get("/roles/{role}", response_model=RoleDetailOut)
async def get_role(
    role: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    return await rbac_service.get_role_detail(db, role)


@router.put("/roles/{role}", response_model=RoleDetailOut)
async def update_role(
    role: str,
    body: RoleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    result = await rbac_service.update_role(db, role, body)
    await record_audit_log(db, user=current_user, action="role.update", resource_type="role", resource_id=result.id or role, details={"role": role, "updated_fields": sorted(body.model_dump(exclude_unset=True).keys())}, request=request)
    await db.commit()
    return result


@router.delete("/roles/{role}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    await rbac_service.delete_role(db, role)
    await record_audit_log(db, user=current_user, action="role.delete", resource_type="role", resource_id=role, details={"role": role}, request=request)
    await db.commit()
    return None


@router.get("/roles/{role}/permissions", response_model=RoleDetailOut)
async def get_role_permissions(
    role: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    return await rbac_service.get_role_detail(db, role)


@router.put("/roles/{role}/permissions", response_model=RoleDetailOut)
async def update_role_permissions(
    role: str,
    request: Request,
    body: RolePermissionsUpdate | list[str] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    permission_ids = body.permission_ids if isinstance(body, RolePermissionsUpdate) else body
    result = await rbac_service.update_role_permissions(db, role, permission_ids)
    await record_audit_log(db, user=current_user, action="role.update_permissions", resource_type="role", resource_id=role, details={"permission_count": len(permission_ids)}, request=request)
    await db.commit()
    return result


@router.get("/resources", response_model=list[ResourceMappingOut])
async def list_resources(
    resource_type: str | None = None,
    permission_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    return await rbac_service.list_resource_mappings(db, resource_type, permission_id)


@router.post("/resources/mappings", response_model=ResourceMappingOut, status_code=status.HTTP_201_CREATED)
async def create_resource_mapping(
    body: ResourceMappingCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    result = await rbac_service.create_resource_mapping(db, body.permission_id, body.resource_type, body.resource_path)
    await record_audit_log(db, user=current_user, action="resource_mapping.create", resource_type="resource_mapping", resource_id=result.id, details={"resource_type": body.resource_type, "resource_path": body.resource_path}, request=request)
    await db.commit()
    return result


@router.delete("/resources/mappings/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource_mapping(
    mapping_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    await rbac_service.delete_resource_mapping(db, mapping_id)
    await record_audit_log(db, user=current_user, action="resource_mapping.delete", resource_type="resource_mapping", resource_id=mapping_id, request=request)
    await db.commit()
    return None


@router.get("/resources/unmapped", response_model=list[UnmappedResourceOut])
async def list_unmapped_resources(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    return await rbac_service.list_unmapped_resources(db, request.app)


@router.post("/resources/sync", response_model=list[UnmappedResourceOut])
async def sync_resources(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    return await rbac_service.list_unmapped_resources(db, request.app)
