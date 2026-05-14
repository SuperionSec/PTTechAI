import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'user' | 'viewer' | 'service'
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Service accounts cannot access frontend pages
  if (user.role === 'service') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-dark-800 rounded-lg p-8 border border-dark-700 max-w-md text-center">
          <h2 className="text-xl font-bold text-white mb-4">{t('auth.serviceAccount')}</h2>
          <p className="text-dark-400 mb-4">
            {t('auth.serviceAccountDesc')}
          </p>
          <p className="text-dark-500 text-sm">
            {t('auth.serviceAccountHint')}
          </p>
        </div>
      </div>
    )
  }

  if (requiredRole && user.role !== requiredRole) {
    if (requiredRole === 'admin') {
      return <Navigate to="/" replace />
    }
  }

  return <>{children}</>
}
