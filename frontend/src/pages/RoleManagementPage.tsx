import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Shield, Eye, Plus, Pencil, Trash2, X, Check, Users, Lock,
  AlertTriangle, Loader2, Globe, Server
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

interface RoleSummary {
  role: string
  user_count: number
  permission_count: number
}

interface Permission {
  id: string
  name: string
  description?: string
}

interface RolePermissionItem {
  id: string
  name: string
  description?: string
  scope: string
  action: string
  is_active: boolean
}

interface RolePermissions {
  role: string
  permissions: RolePermissionItem[]
  total: number
}

interface ResourceMapping {
  id: string
  permission_id: string
  resource_type: string
  resource_path: string
}

const SYSTEM_ROLES = ['admin', 'user', 'viewer', 'service']

export default function RoleManagementPage() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()

  const [roles, setRoles] = useState<RoleSummary[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string | null>(null)

  // Form state
  const [roleName, setRoleName] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())
  const [roleNameError, setRoleNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // View modal state
  const [viewRolePermissions, setViewRolePermissions] = useState<RolePermissionItem[]>([])
  const [viewLoading, setViewLoading] = useState(false)
  const [viewResourceMappings, setViewResourceMappings] = useState<ResourceMapping[]>([])
  const [activeViewTab, setActiveViewTab] = useState<'permissions' | 'resources'>('permissions')

  // Delete modal state
  const [roleToDelete, setRoleToDelete] = useState<RoleSummary | null>(null)

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
    fetchPermissions()
  }, [currentUser, navigate])

  const fetchRoles = async () => {
    try {
      setLoading(true)
      const res = await api.get('/permissions/roles')
      setRoles(res.data)
    } catch (error) {
      console.error('Failed to fetch roles:', error)
      alert(t('roleManagement.fetchFailed') || 'Failed to fetch roles')
    } finally {
      setLoading(false)
    }
  }

  const fetchPermissions = async () => {
    try {
      const res = await api.get('/permissions')
      setPermissions(res.data)
    } catch (error) {
      console.error('Failed to fetch permissions:', error)
    }
  }

  const isSystemRole = (role: string) => SYSTEM_ROLES.includes(role)

  const validateRoleName = (name: string): boolean => {
    if (!name) {
      setRoleNameError(t('roleManagement.roleNameRequired') || 'Role name is required')
      return false
    }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      setRoleNameError(t('roleManagement.roleNameInvalid') || 'Only alphanumeric and underscore allowed')
      return false
    }
    setRoleNameError(null)
    return true
  }

  const resetForm = () => {
    setRoleName('')
    setSelectedPermissions(new Set())
    setRoleNameError(null)
    setFormError(null)
    setSelectedRole(null)
  }

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateRoleName(roleName)) return

    setActionLoading(true)
    setFormError(null)
    try {
      await api.post('/permissions/roles', {
        role: roleName,
        permission_ids: Array.from(selectedPermissions),
      })
      setShowCreateModal(false)
      resetForm()
      fetchRoles()
      alert(t('roleManagement.createSuccess') || 'Role created successfully')
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (typeof detail === 'string') {
        setFormError(detail)
      } else {
        setFormError(t('roleManagement.createFailed') || 'Failed to create role')
      }
    } finally {
      setActionLoading(false)
    }
  }

  const openEditModal = async (role: string) => {
    setSelectedRole(role)
    setRoleName(role)
    setFormError(null)
    setRoleNameError(null)
    setActionLoading(true)
    try {
      const res = await api.get(`/permissions/roles/${role}`)
      const data: RolePermissions = res.data
      setSelectedPermissions(new Set(data.permissions.map(p => p.id) || []))
      setShowEditModal(true)
    } catch (error) {
      console.error('Failed to fetch role permissions:', error)
      alert(t('roleManagement.fetchRoleFailed') || 'Failed to fetch role permissions')
      resetForm()
    } finally {
      setActionLoading(false)
    }
  }

  const handleEditRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRole) return

    setActionLoading(true)
    setFormError(null)
    try {
      await api.put(`/permissions/roles/${selectedRole}`, {
        permission_ids: Array.from(selectedPermissions),
      })
      setShowEditModal(false)
      resetForm()
      fetchRoles()
      alert(t('roleManagement.updateSuccess') || 'Role updated successfully')
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (typeof detail === 'string') {
        setFormError(detail)
      } else {
        setFormError(t('roleManagement.updateFailed') || 'Failed to update role')
      }
    } finally {
      setActionLoading(false)
    }
  }

  const openViewModal = async (role: string) => {
    setSelectedRole(role)
    setViewLoading(true)
    setShowViewModal(true)
    setActiveViewTab('permissions')
    try {
      const [roleRes, mappingRes] = await Promise.all([
        api.get(`/permissions/roles/${role}`),
        api.get('/permissions/resource-mappings')
      ])
      const data: RolePermissions = roleRes.data
      setViewRolePermissions(data.permissions || [])
      
      // Filter resource mappings for this role's permissions
      const rolePermIds = new Set(data.permissions.map(p => p.id))
      const allMappings: ResourceMapping[] = mappingRes.data
      setViewResourceMappings(allMappings.filter(m => rolePermIds.has(m.permission_id)))
    } catch (error) {
      console.error('Failed to fetch role permissions:', error)
      setViewRolePermissions([])
      setViewResourceMappings([])
    } finally {
      setViewLoading(false)
    }
  }

  const openDeleteModal = (role: RoleSummary) => {
    setRoleToDelete(role)
    setShowDeleteModal(true)
  }

  const handleDeleteRole = async () => {
    if (!roleToDelete) return
    if (roleToDelete.user_count > 0) {
      return
    }

    setActionLoading(true)
    try {
      await api.delete(`/permissions/roles/${roleToDelete.role}`)
      setShowDeleteModal(false)
      setRoleToDelete(null)
      fetchRoles()
      alert(t('roleManagement.deleteSuccess') || 'Role deleted successfully')
    } catch (error: any) {
      const detail = error.response?.data?.detail
      alert(detail || (t('roleManagement.deleteFailed') || 'Failed to delete role'))
    } finally {
      setActionLoading(false)
    }
  }

  const togglePermission = (permId: string) => {
    setSelectedPermissions(prev => {
      const next = new Set(prev)
      if (next.has(permId)) {
        next.delete(permId)
      } else {
        next.add(permId)
      }
      return next
    })
  }

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
          onClick={() => { resetForm(); setShowCreateModal(true) }}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> {t('roleManagement.createRole')}
        </button>
      </div>

      <div className="bg-dark-800 rounded-lg shadow-sm border border-dark-700">
        <div className="p-4 border-b border-dark-700 flex items-center gap-2">
          <Shield className="w-5 h-5 text-dark-400" />
          <span className="font-medium text-white">{t('roleManagement.roles')} ({roles.length})</span>
        </div>
        <table className="min-w-full divide-y divide-dark-700">
          <thead className="bg-dark-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{t('roleManagement.roleName')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{t('roleManagement.userCount')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{t('roleManagement.permissionCount')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-dark-400 uppercase tracking-wider">{t('roleManagement.actions')}</th>
            </tr>
          </thead>
          <tbody className="bg-dark-800 divide-y divide-dark-700">
            {roles.map(role => (
              <tr key={role.role} className="hover:bg-dark-700/50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${roleColors[role.role] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                      {roleLabels[role.role] || role.role}
                    </span>
                    {isSystemRole(role.role) && (
                      <span className="text-xs text-dark-500 bg-dark-700 px-2 py-0.5 rounded">
                        {t('roleManagement.system')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-sm text-dark-300">
                    <Users className="w-3.5 h-3.5" />
                    {role.user_count}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-sm text-dark-300">
                    <Lock className="w-3.5 h-3.5" />
                    {role.permission_count}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => openViewModal(role.role)}
                    className="text-emerald-400 hover:text-emerald-300 mr-3"
                    title={t('roleManagement.view')}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEditModal(role.role)}
                    disabled={isSystemRole(role.role)}
                    className={`mr-3 ${isSystemRole(role.role) ? 'text-dark-600 cursor-not-allowed' : 'text-blue-400 hover:text-blue-300'}`}
                    title={isSystemRole(role.role) ? t('roleManagement.systemRoleEditDisabled') : t('roleManagement.edit')}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openDeleteModal(role)}
                    disabled={isSystemRole(role.role)}
                    className={isSystemRole(role.role) ? 'text-dark-600 cursor-not-allowed' : 'text-red-400 hover:text-red-300'}
                    title={isSystemRole(role.role) ? t('roleManagement.systemRoleDeleteDisabled') : t('roleManagement.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Role Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-lg p-6 w-[32rem] max-h-[90vh] overflow-y-auto border border-dark-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">{t('roleManagement.createRole')}</h3>
              <button onClick={() => { setShowCreateModal(false); resetForm() }} className="text-dark-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRole} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">{t('roleManagement.roleName')}</label>
                <input
                  value={roleName}
                  onChange={e => { setRoleName(e.target.value); if (roleNameError) validateRoleName(e.target.value) }}
                  placeholder={t('roleManagement.roleNamePlaceholder') || 'e.g. auditor'}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-md text-white placeholder-dark-500"
                  required
                />
                {roleNameError && (
                  <p className="text-red-400 text-xs mt-1">{roleNameError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  {t('roleManagement.permissions')} ({selectedPermissions.size})
                </label>
                <div className="max-h-64 overflow-y-auto border border-dark-700 rounded-md p-3 space-y-2">
                  {permissions.length === 0 ? (
                    <p className="text-dark-500 text-sm">{t('roleManagement.noPermissions')}</p>
                  ) : (
                    permissions.map(perm => (
                      <label key={perm.id} className="flex items-start gap-2 cursor-pointer hover:bg-dark-700/50 p-1.5 rounded">
                        <input
                          type="checkbox"
                          checked={selectedPermissions.has(perm.id)}
                          onChange={() => togglePermission(perm.id)}
                          className="mt-0.5 accent-emerald-500"
                        />
                        <div>
                          <div className="text-sm text-white">{perm.name}</div>
                          {perm.description && (
                            <div className="text-xs text-dark-500">{perm.description}</div>
                          )}
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {formError && (
                <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); resetForm() }}
                  className="px-4 py-2 text-dark-300 bg-dark-700 rounded-md hover:bg-dark-600"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {showEditModal && selectedRole && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-lg p-6 w-[32rem] max-h-[90vh] overflow-y-auto border border-dark-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">{t('roleManagement.editRole')} - {selectedRole}</h3>
              <button onClick={() => { setShowEditModal(false); resetForm() }} className="text-dark-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditRole} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  {t('roleManagement.permissions')} ({selectedPermissions.size})
                </label>
                <div className="max-h-64 overflow-y-auto border border-dark-700 rounded-md p-3 space-y-2">
                  {permissions.length === 0 ? (
                    <p className="text-dark-500 text-sm">{t('roleManagement.noPermissions')}</p>
                  ) : (
                    permissions.map(perm => (
                      <label key={perm.id} className="flex items-start gap-2 cursor-pointer hover:bg-dark-700/50 p-1.5 rounded">
                        <input
                          type="checkbox"
                          checked={selectedPermissions.has(perm.id)}
                          onChange={() => togglePermission(perm.id)}
                          className="mt-0.5 accent-emerald-500"
                        />
                        <div>
                          <div className="text-sm text-white">{perm.name}</div>
                          {perm.description && (
                            <div className="text-xs text-dark-500">{perm.description}</div>
                          )}
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {formError && (
                <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); resetForm() }}
                  className="px-4 py-2 text-dark-300 bg-dark-700 rounded-md hover:bg-dark-600"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Role Permissions Modal */}
      {showViewModal && selectedRole && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-lg p-6 w-[32rem] max-h-[90vh] overflow-y-auto border border-dark-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">{t('roleManagement.rolePermissions')} - {selectedRole}</h3>
              <button onClick={() => { setShowViewModal(false); setSelectedRole(null) }} className="text-dark-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-dark-900 rounded-lg p-1">
              <button
                onClick={() => setActiveViewTab('permissions')}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeViewTab === 'permissions' 
                    ? 'bg-dark-700 text-white' 
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                <Lock className="w-4 h-4 inline mr-1" />
                {t('roleManagement.permissions')} ({viewRolePermissions.length})
              </button>
              <button
                onClick={() => setActiveViewTab('resources')}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeViewTab === 'resources' 
                    ? 'bg-dark-700 text-white' 
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                <Globe className="w-4 h-4 inline mr-1" />
                {t('roleManagement.resources')} ({viewResourceMappings.length})
              </button>
            </div>
            
            {viewLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              </div>
            ) : activeViewTab === 'permissions' ? (
              viewRolePermissions.length === 0 ? (
                <div className="text-center py-8 text-dark-500">
                  <Lock className="w-8 h-8 mx-auto mb-2" />
                  <p>{t('roleManagement.noPermissionsAssigned')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {viewRolePermissions.map(perm => (
                    <div key={perm.id} className="flex items-center gap-2 px-3 py-2 bg-dark-900 rounded-md border border-dark-700">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white">{perm.name}</span>
                        {perm.description && (
                          <span className="text-xs text-dark-500 ml-2">{perm.description}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              viewResourceMappings.length === 0 ? (
                <div className="text-center py-8 text-dark-500">
                  <Globe className="w-8 h-8 mx-auto mb-2" />
                  <p>{t('roleManagement.noResourcesAssigned') || 'No resources assigned'}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Frontend Pages */}
                  {viewResourceMappings.filter(m => m.resource_type === 'frontend_page').length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-dark-300 mb-2 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-blue-400" />
                        {t('roleManagement.frontendPages') || 'Frontend Pages'}
                      </h4>
                      <div className="space-y-1">
                        {viewResourceMappings
                          .filter(m => m.resource_type === 'frontend_page')
                          .map(m => (
                            <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 bg-dark-900 rounded-md border border-dark-700">
                              <span className="text-xs text-blue-400 font-mono">{m.resource_path}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Backend APIs */}
                  {viewResourceMappings.filter(m => m.resource_type === 'backend_api').length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-dark-300 mb-2 flex items-center gap-2">
                        <Server className="w-4 h-4 text-emerald-400" />
                        {t('roleManagement.backendApis') || 'Backend APIs'}
                      </h4>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {viewResourceMappings
                          .filter(m => m.resource_type === 'backend_api')
                          .map(m => (
                            <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 bg-dark-900 rounded-md border border-dark-700">
                              <span className="text-xs text-emerald-400 font-mono">{m.resource_path}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
            <div className="flex justify-end mt-4">
              <button
                onClick={() => { setShowViewModal(false); setSelectedRole(null) }}
                className="px-4 py-2 bg-dark-700 text-white rounded-md hover:bg-dark-600"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && roleToDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-lg p-6 w-[24rem] border border-dark-700">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <h3 className="text-lg font-medium text-white">{t('roleManagement.deleteRole')}</h3>
            </div>
            <p className="text-dark-300 mb-4">
              {t('roleManagement.deleteConfirm', { role: roleToDelete.role })}
            </p>
            {roleToDelete.user_count > 0 ? (
              <div className="bg-red-900/20 border border-red-800 rounded-md px-3 py-2 mb-4">
                <p className="text-red-400 text-sm">
                  {t('roleManagement.cannotDeleteUsersAssigned', { count: roleToDelete.user_count })}
                </p>
              </div>
            ) : (
              <p className="text-dark-500 text-sm mb-4">{t('roleManagement.noUsersAssigned')}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowDeleteModal(false); setRoleToDelete(null) }}
                className="px-4 py-2 text-dark-300 bg-dark-700 rounded-md hover:bg-dark-600"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDeleteRole}
                disabled={roleToDelete.user_count > 0 || actionLoading}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
