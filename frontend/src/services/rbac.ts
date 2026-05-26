import { del, get, post, put } from './request'

export interface RbacProfile {
  role: string
  permissions: string[]
  frontend_pages: string[]
  backend_apis: string[]
  access?: Record<string, boolean>
  menus?: Array<{ path: string; name: string; permission?: string | null }>
}

export interface Permission {
  id: string
  name: string
  description?: string
  scope?: string
  action?: string
  is_active?: boolean
}

export interface RoleSummary {
  role: string
  id?: string | null
  display_name?: string | null
  description?: string | null
  is_system?: boolean
  is_active?: boolean
  user_count: number
  permission_count: number
}

export interface RoleDetail {
  role: string
  id?: string | null
  display_name?: string | null
  description?: string | null
  is_system?: boolean
  is_active?: boolean
  permissions: Permission[]
  total: number
}

export interface ResourceMapping {
  id: string
  permission_id: string
  permission_name?: string | null
  resource_type: string
  resource_path: string
  version?: number
  updated_at?: string | null
}

export interface UnmappedResource {
  resource_type: string
  resource_path: string
  reason: string
}

export const rbacApi = {
  me: () => get<RbacProfile>('/rbac/me'),
  roles: () => get<RoleSummary[]>('/rbac/roles'),
  role: (role: string) => get<RoleDetail>(`/rbac/roles/${role}`),
  createRole: (data: { name: string; display_name: string; description?: string; permission_ids: string[] }) => post<RoleDetail>('/rbac/roles', data),
  updateRole: (role: string, data: { display_name?: string; description?: string; is_active?: boolean; permission_ids?: string[] }) => put<RoleDetail>(`/rbac/roles/${role}`, data),
  updateRolePermissions: (role: string, permissionIds: string[]) => put<RoleDetail>(`/rbac/roles/${role}/permissions`, { permission_ids: permissionIds }),
  deleteRole: (role: string) => del<void>(`/rbac/roles/${role}`),
  permissions: () => get<Permission[]>('/rbac/permissions'),
  resourceMappings: () => get<ResourceMapping[]>('/rbac/resources'),
  unmappedResources: () => get<UnmappedResource[]>('/rbac/resources/unmapped'),
  createResourceMapping: (data: { permission_id: string; resource_type: string; resource_path: string }) => post<ResourceMapping>('/rbac/resources/mappings', data),
}
