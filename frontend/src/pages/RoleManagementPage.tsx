import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Shield, Eye, Globe, Server, Plus, Pencil, Trash2, Lock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

interface RoleAccess {
  role: string
  frontend_pages: string[]
  backend_apis: string[]
}

export default function RoleManagementPage() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const [roles, setRoles] = useState<RoleAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRole, setSelectedRole] = useState<string | null>(null)

  const roleLabels: Record<string, string> = {
    admin: t('roleManagement.admin'),
    user: t('roleManagement.user'),
    viewer: t('roleManagement.viewer'),
    service: t('roleManagement.service'),
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-red-100 text-red-800 border-red-200',
    user: 'bg-blue-100 text-blue-800 border-blue-200',
    viewer: 'bg-gray-100 text-gray-800 border-gray-200',
    service: 'bg-purple-100 text-purple-800 border-purple-200',
  }

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      navigate('/')
      return
    }
    fetchRoles()
  }, [currentUser, navigate])

  const fetchRoles = async () => {
    try {
      const res = await api.get('/permissions/roles/access')
      setRoles(res.data)
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectedRoleData = roles.find(r => r.role === selectedRole)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('roleManagement.title')}</h1>
          <p className="text-dark-400 mt-1">{t('roleManagement.subtitle')}</p>
        </div>
        <button
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-2 opacity-50 cursor-not-allowed"
          title={`${t('roleManagement.createRole')} - ${t('roleManagement.comingSoon')}`}
        >
          <Plus className="w-4 h-4" /> {t('roleManagement.createRole')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role List */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            {t('roleManagement.roles')} ({roles.length})
          </h2>
          {roles.map(role => (
            <button
              key={role.role}
              onClick={() => setSelectedRole(role.role)}
              className={`w-full text-left p-4 rounded-lg border transition-all ${
                selectedRole === role.role
                  ? 'bg-dark-700 border-emerald-500/50 ring-1 ring-emerald-500/30'
                  : 'bg-dark-800 border-dark-700 hover:bg-dark-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${roleColors[role.role]}`}>
                    {roleLabels[role.role] || role.role}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="p-1.5 text-dark-400 hover:text-emerald-400 rounded-md hover:bg-dark-600 opacity-50 cursor-not-allowed"
                    title={`${t('roleManagement.edit')} - ${t('roleManagement.comingSoon')}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-1.5 text-dark-400 hover:text-red-400 rounded-md hover:bg-dark-600 opacity-50 cursor-not-allowed"
                    title={`${t('roleManagement.delete')} - ${t('roleManagement.comingSoon')}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-2 text-sm text-dark-400">
                <span className="inline-flex items-center gap-1 mr-4">
                  <Globe className="w-3.5 h-3.5" />
                  {role.frontend_pages.length} {t('roleManagement.pages')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Server className="w-3.5 h-3.5" />
                  {role.backend_apis.length} {t('roleManagement.apis')}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Role Detail */}
        <div className="lg:col-span-2">
          {selectedRoleData ? (
            <div className="space-y-6">
              <div className="bg-dark-800 rounded-lg border border-dark-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${roleColors[selectedRoleData.role]}`}>
                      {roleLabels[selectedRoleData.role] || selectedRoleData.role}
                    </span>
                    <span className="text-dark-300">{t('roleManagement.accessDetails')}</span>
                  </h2>
                </div>

                {/* Frontend Pages */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-dark-300 mb-3 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    {t('roleManagement.frontendPages')} ({selectedRoleData.frontend_pages.length})
                  </h3>
                  {selectedRoleData.frontend_pages.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {selectedRoleData.frontend_pages.map(page => (
                        <div
                          key={page}
                          className="px-3 py-2 bg-dark-900 rounded-md text-sm text-dark-300 border border-dark-700 flex items-center gap-2"
                        >
                          <Eye className="w-3.5 h-3.5 text-dark-500" />
                          {page}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-4 bg-dark-900 rounded-md text-sm text-dark-500 border border-dark-700 flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      {t('roleManagement.noFrontendAccess')}
                    </div>
                  )}
                </div>

                {/* Backend APIs */}
                <div>
                  <h3 className="text-sm font-medium text-dark-300 mb-3 flex items-center gap-2">
                    <Server className="w-4 h-4 text-blue-400" />
                    {t('roleManagement.backendApis')} ({selectedRoleData.backend_apis.length})
                  </h3>
                  <div className="space-y-2">
                    {selectedRoleData.backend_apis.map(api => (
                      <div
                        key={api}
                        className="px-3 py-2 bg-dark-900 rounded-md text-sm text-dark-300 border border-dark-700 flex items-center gap-2"
                      >
                        <Server className="w-3.5 h-3.5 text-dark-500" />
                        <code className="text-emerald-400">{api}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-dark-800 rounded-lg border border-dark-700 p-12 text-center">
              <Shield className="w-12 h-12 text-dark-600 mx-auto mb-4" />
              <p className="text-dark-400">{t('roleManagement.selectRoleToView')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Reserved Actions Notice */}
      <div className="bg-dark-800/50 rounded-lg border border-dark-700 p-4">
        <p className="text-sm text-dark-400 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          {t('roleManagement.reservedActions')}
        </p>
      </div>
    </div>
  )
}
