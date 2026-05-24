import { Navigate, useLocation } from 'react-router-dom'
import { Result, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import type { AppRoute } from './routeConfig'
import { useAuth } from '../contexts/AuthContext'
import { canAccessPath } from './access'
import Forbidden from '../pages/Exception/Forbidden'

interface RouteGuardProps {
  route: AppRoute
}

export default function RouteGuard({ route }: RouteGuardProps) {
  const location = useLocation()
  const { t } = useTranslation()
  const { user, userPermissions, loading } = useAuth()

  if (route.public) {
    return <>{route.element}</>
  }

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '20vh auto' }} />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.role === 'service') {
    return (
      <Result
        status="403"
        title={t('auth.serviceAccount', 'Service account')}
        subTitle={t('auth.serviceAccountDesc', 'Service accounts cannot access frontend pages.')}
      />
    )
  }

  const allowed = canAccessPath({
    role: userPermissions?.role,
    permissions: userPermissions?.permissions,
    frontendPages: userPermissions?.frontend_pages,
  }, location.pathname, route.permission)

  if (!allowed) {
    return <Forbidden />
  }

  return <>{route.element}</>
}
