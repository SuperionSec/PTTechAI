import api from '../api'

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

export const systemApi = {
  me: async () => {
    const response = await api.get<RbacProfile>('/system/me')
    return response.data
  },
  roles: async () => {
    const response = await api.get<RoleSummary[]>('/system/roles')
    return response.data
  },
  role: async (role: string) => {
    const response = await api.get<RoleDetail>(`/system/roles/${role}`)
    return response.data
  },
  createRole: async (data: { name: string; display_name: string; description?: string; is_active?: boolean; permission_ids: string[] }) => {
    const response = await api.post<RoleDetail>('/system/roles', data)
    return response.data
  },
  updateRole: async (role: string, data: { display_name?: string; description?: string; is_active?: boolean; permission_ids?: string[] }) => {
    const response = await api.put<RoleDetail>(`/system/roles/${role}`, data)
    return response.data
  },
  deleteRole: async (role: string) => {
    const response = await api.delete<void>(`/system/roles/${role}`)
    return response.data
  },
  permissions: async () => {
    const response = await api.get<Permission[]>('/system/permissions')
    return response.data
  },
  resourceMappings: async () => {
    const response = await api.get<ResourceMapping[]>('/system/resources')
    return response.data
  },
  unmappedResources: async () => {
    const response = await api.get<UnmappedResource[]>('/system/resources/unmapped')
    return response.data
  },
  createResourceMapping: async (data: { permission_id: string; resource_type: string; resource_path: string }) => {
    const response = await api.post<ResourceMapping>('/system/resources/mappings', data)
    return response.data
  },
}

export interface UserCreateRequest {
  email: string
  password: string
  full_name: string
  role: string
  tenant_id?: string | null
  department_id?: string | null
  data_scope?: string
}

export interface UserUpdateRequest {
  email?: string
  password?: string
  full_name?: string
  role?: string
  is_active?: boolean
  tenant_id?: string | null
  department_id?: string | null
  data_scope?: string
}

export const usersApi = {
  /** Returns the users array (unwraps the paginated envelope) for callers that
   *  only need the rows — department/tenant panels. */
  list: async (params?: { tenant_id?: string; department_id?: string; role?: string; is_active?: boolean; page?: number; page_size?: number }) => {
    const response = await api.get('/system/users', { params })
    const data = response.data
    return Array.isArray(data) ? data : (data.items ?? [])
  },
  /** Returns the full paginated envelope { items, total, page, page_size } for server-side tables. */
  listPaged: async (params?: { tenant_id?: string; department_id?: string; role?: string; is_active?: boolean; page?: number; page_size?: number }) => {
    const response = await api.get('/system/users', { params })
    const data = response.data
    if (Array.isArray(data)) return { items: data, total: data.length, page: 1, page_size: data.length }
    return { items: data.items ?? [], total: data.total ?? 0, page: data.page ?? 1, page_size: data.page_size ?? 20 }
  },
  create: async (data: UserCreateRequest) => {
    const response = await api.post('/system/users', data)
    return response.data
  },
  update: async (userId: string, data: UserUpdateRequest) => {
    const response = await api.put(`/system/users/${userId}`, data)
    return response.data
  },
  delete: async (userId: string) => {
    const response = await api.delete(`/system/users/${userId}`)
    return response.data
  },
  resetPassword: async (userId: string, newPassword: string) => {
    const response = await api.post(`/system/users/${userId}/reset-password`, { new_password: newPassword })
    return response.data
  },
}

// ── Organization: Tenants + Departments ──
export interface Tenant {
  id: string
  code: string
  name: string
  status: string
  logo_url?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  max_users?: number | null
  max_storage_gb?: number | null
  expires_at?: string | null
  is_active: boolean
  created_at?: string | null
  updated_at?: string | null
  user_count: number
  department_count: number
}

export interface TenantCreateRequest {
  code: string
  name: string
  status?: string
  contact_email?: string | null
  contact_phone?: string | null
  max_users?: number | null
  max_storage_gb?: number | null
  expires_at?: string | null
}

export interface TenantUpdateRequest {
  name?: string
  status?: string
  contact_email?: string | null
  contact_phone?: string | null
  max_users?: number | null
  max_storage_gb?: number | null
  expires_at?: string | null
  is_active?: boolean
}

export interface DepartmentNode {
  id: string
  tenant_id: string
  parent_id: string | null
  name: string
  sort_order: number
  description?: string | null
  is_active: boolean
  user_count?: number
  children: DepartmentNode[]
}

export interface DepartmentCreateRequest {
  name: string
  parent_id?: string | null
  sort_order?: number
  description?: string | null
  tenant_id?: string | null
}

export interface DepartmentUpdateRequest {
  name?: string
  parent_id?: string | null
  sort_order?: number
  description?: string | null
  is_active?: boolean
}

export const organizationApi = {
  tenants: async (params?: { search?: string; skip?: number; limit?: number }) => {
    const response = await api.get<{ tenants: Tenant[]; total: number }>('/organization/tenants', { params })
    return response.data
  },
  tenant: async (id: string) => {
    const response = await api.get<Tenant>(`/organization/tenants/${id}`)
    return response.data
  },
  createTenant: async (data: TenantCreateRequest) => {
    const response = await api.post<Tenant>('/organization/tenants', data)
    return response.data
  },
  updateTenant: async (id: string, data: TenantUpdateRequest) => {
    const response = await api.put<Tenant>(`/organization/tenants/${id}`, data)
    return response.data
  },
  suspendTenant: async (id: string) => {
    const response = await api.delete<void>(`/organization/tenants/${id}`)
    return response.data
  },
  setTenantAdmin: async (tenantId: string, userId: string) => {
    const response = await api.post(`/organization/tenants/${tenantId}/admins`, { user_id: userId })
    return response.data
  },
  departmentTree: async (tenantId?: string) => {
    const response = await api.get<{ departments: DepartmentNode[]; total: number }>(
      '/organization/departments/tree',
      { params: tenantId ? { tenant_id: tenantId } : undefined },
    )
    return response.data
  },
  createDepartment: async (data: DepartmentCreateRequest) => {
    const response = await api.post<DepartmentNode>('/organization/departments', data)
    return response.data
  },
  updateDepartment: async (id: string, data: DepartmentUpdateRequest) => {
    const response = await api.put<DepartmentNode>(`/organization/departments/${id}`, data)
    return response.data
  },
  deleteDepartment: async (id: string) => {
    const response = await api.delete<void>(`/organization/departments/${id}`)
    return response.data
  },
}

export const profileApi = {
  update: async (data: { full_name?: string; phone?: string; remark?: string }) => {
    const response = await api.put('/system/profile/me', data)
    return response.data
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await api.put('/system/profile/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
    return response.data
  },
}

export const apiKeysApi = {
  list: async () => {
    const response = await api.get('/system/api-keys')
    return response.data
  },
  create: async (name: string) => {
    const response = await api.post('/system/api-keys', { name })
    return response.data
  },
  delete: async (keyId: string) => {
    const response = await api.delete(`/system/api-keys/${keyId}`)
    return response.data
  },
}

export interface Menu {
  id: string
  parent_id: string | null
  name: string
  path: string | null
  component: string | null
  icon: string | null
  sort_order: number
  menu_type: string
  permission: string | null
  is_visible: boolean
  is_active: boolean
  created_at?: string
  updated_at?: string
  children?: Menu[]
}

export interface MenuCreate {
  parent_id?: string | null
  name: string
  path?: string | null
  component?: string | null
  icon?: string | null
  sort_order?: number
  menu_type?: string
  permission?: string | null
  is_visible?: boolean
  is_active?: boolean
}

export interface MenuUpdate {
  parent_id?: string | null
  name?: string
  path?: string | null
  component?: string | null
  icon?: string | null
  sort_order?: number
  menu_type?: string
  permission?: string | null
  is_visible?: boolean
  is_active?: boolean
}

export const menuApi = {
  list: async () => {
    const response = await api.get<Menu[]>('/menus')
    return response.data
  },
  tree: async () => {
    const response = await api.get<{ menus: Menu[]; total: number }>('/menus/tree')
    return response.data
  },
  userTree: async () => {
    const response = await api.get<{ menus: Menu[]; total: number }>('/menus/user')
    return response.data
  },
  get: async (id: string) => {
    const response = await api.get<Menu>(`/menus/${id}`)
    return response.data
  },
  create: async (data: MenuCreate) => {
    const response = await api.post<Menu>('/menus', data)
    return response.data
  },
  update: async (id: string, data: MenuUpdate) => {
    const response = await api.put<Menu>(`/menus/${id}`, data)
    return response.data
  },
  delete: async (id: string) => {
    const response = await api.delete<void>(`/menus/${id}`)
    return response.data
  },
}

export interface AuditLog {
  id: string
  user_id: string | null
  username: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export const auditApi = {
  list: async (params?: { action?: string; resource_type?: string; username?: string; start_date?: string; end_date?: string; page?: number; per_page?: number }) => {
    const response = await api.get<{ logs: AuditLog[]; total: number }>('/audit', { params })
    return response.data
  },
  export: async (format: 'csv' | 'json', params?: { action?: string; resource_type?: string; username?: string; start_date?: string; end_date?: string }) => {
    const response = await api.get('/audit/export', { params: { ...params, format }, responseType: 'blob' })
    const blob = new Blob([response.data], { type: format === 'csv' ? 'text/csv' : 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },
}

export interface OnlineSession {
  jti: string
  user_id: string
  username: string
  full_name?: string | null
  tenant_id?: string | null
  ip_address?: string | null
  device_info?: string | null
  login_method?: string | null
  created_at?: string | null
  last_used_at?: string | null
  expires_at?: string | null
}

export const sessionApi = {
  list: async () => {
    const response = await api.get<{ sessions: OnlineSession[]; total: number }>('/system/sessions')
    return response.data
  },
  forceLogout: async (jti: string) => {
    const response = await api.delete(`/system/sessions/${jti}`)
    return response.data
  },
}

export interface MonitorHealth {
  status: string
  app: string
  version: string
  debug: boolean
  timestamp: string
  python: string
  platform: string
}

export interface MonitorDatabase {
  status: string
  database_url_configured: boolean
  checked_at: string
}

export const monitorApi = {
  health: async () => {
    const response = await api.get<MonitorHealth>('/monitor/health')
    return response.data
  },
  database: async () => {
    const response = await api.get<MonitorDatabase>('/monitor/database')
    return response.data
  },
}

