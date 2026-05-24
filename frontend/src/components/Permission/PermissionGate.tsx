import type { ReactNode } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { hasPermission } from '../../routes/access'

interface PermissionGateProps {
  permission?: string
  children: ReactNode
  fallback?: ReactNode
}

export default function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { userPermissions } = useAuth()
  const allowed = hasPermission({
    role: userPermissions?.role,
    permissions: userPermissions?.permissions,
  }, permission)

  return <>{allowed ? children : fallback}</>
}
