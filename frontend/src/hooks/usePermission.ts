import { useAuth } from '../contexts/AuthContext'

export function usePermission() {
  const { hasPermission, canAccessPage, userPermissions } = useAuth()

  const canAccessApi = (apiPath: string) => {
    if (!userPermissions) return false
    if (userPermissions.role === 'admin') return true
    return userPermissions.backend_apis.includes(apiPath)
  }

  return {
    hasPermission,
    canAccessPage,
    canAccessApi,
    permissions: userPermissions?.permissions || [],
    frontendPages: userPermissions?.frontend_pages || [],
    backendApis: userPermissions?.backend_apis || [],
    role: userPermissions?.role || null,
  }
}
