import api from '../api'
import type { Permission, ResourceMapping, RbacProfile, RoleDetail, RoleSummary, UnmappedResource } from '../rbac'

export { rbacApi } from '../rbac'
export type { Permission, ResourceMapping, RbacProfile, RoleDetail, RoleSummary, UnmappedResource } from '../rbac'

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
  updateRolePermissions: async (role: string, permissionIds: string[]) => {
    const response = await api.put<RoleDetail>(`/system/roles/${role}/permissions`, { permission_ids: permissionIds })
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

export const usersApi = {
  list: async () => {
    const response = await api.get('/system/users')
    return response.data
  },
  create: async (data: unknown) => {
    const response = await api.post('/system/users', data)
    return response.data
  },
  update: async (userId: string, data: unknown) => {
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

export const profileApi = {
  update: async (fullName: string) => {
    const response = await api.put('/system/profile/me', { full_name: fullName })
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
