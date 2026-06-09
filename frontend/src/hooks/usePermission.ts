import { useAuth } from '../contexts/AuthContext'
import type { AccessMap } from './useAccess'

export function usePermission() {
  const { hasPermission, canAccessPage, userPermissions, access } = useAuth()

  const canAccessApi = (apiPath: string) => {
    if (!userPermissions) return false
    if (userPermissions.role === 'admin') return true
    return userPermissions.backend_apis.includes(apiPath)
  }

  return {
    hasPermission,
    canAccessPage,
    canAccessApi,
    access: access as unknown as AccessMap,
    permissions: userPermissions?.permissions || [],
    frontendPages: userPermissions?.frontend_pages || [],
    backendApis: userPermissions?.backend_apis || [],
    role: userPermissions?.role || null,
  }
}
