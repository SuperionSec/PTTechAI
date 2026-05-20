import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, Globe, Server, Link2, ArrowLeft,
  Loader2, Plus, CheckCircle
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

interface UnmappedResource {
  resource_type: string
  resource_path: string
  reason: string
}

interface Permission {
  id: string
  name: string
  description?: string
  scope: string
  action: string
}

export default function UnmappedResourcesPage() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()

  const [unmappedResources, setUnmappedResources] = useState<UnmappedResource[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Mapping form state
  const [selectedPermission, setSelectedPermission] = useState<string>('')
  const [showMappingForm, setShowMappingForm] = useState<string | null>(null)

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      navigate('/')
      return
    }
    fetchUnmappedResources()
    fetchPermissions()
  }, [currentUser, navigate])

  const fetchUnmappedResources = async () => {
    try {
      setLoading(true)
      const res = await api.get('/permissions/unmapped-resources')
      setUnmappedResources(res.data)
    } catch (error) {
      console.error('Failed to fetch unmapped resources:', error)
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

  const handleCreateMapping = async (resourcePath: string, resourceType: string) => {
    if (!selectedPermission) return

    setActionLoading(resourcePath)
    setSuccessMessage(null)
    try {
      await api.post('/permissions/resource-mappings', {
        permission_id: selectedPermission,
        resource_type: resourceType,
        resource_path: resourcePath,
      })
      setSuccessMessage(`Mapped ${resourcePath} to permission`)
      setShowMappingForm(null)
      setSelectedPermission('')
      fetchUnmappedResources()
    } catch (error: any) {
      console.error('Failed to create mapping:', error)
      alert(error.response?.data?.detail || 'Failed to create mapping')
    } finally {
      setActionLoading(null)
    }
  }

  const getRecommendedPermission = (resourcePath: string, resourceType: string): string => {
    // Simple recommendation logic
    if (resourceType === 'frontend_page') {
      if (resourcePath.includes('scan')) return permissions.find(p => p.name === 'scan:read')?.id || ''
      if (resourcePath.includes('report')) return permissions.find(p => p.name === 'report:read')?.id || ''
      if (resourcePath.includes('user') || resourcePath.includes('role')) return permissions.find(p => p.name === 'user:manage')?.id || ''
      if (resourcePath.includes('settings')) return permissions.find(p => p.name === 'settings:read')?.id || ''
      if (resourcePath.includes('agent')) return permissions.find(p => p.name === 'agent:read')?.id || ''
      if (resourcePath.includes('scheduler')) return permissions.find(p => p.name === 'scheduler:read')?.id || ''
      if (resourcePath.includes('knowledge')) return permissions.find(p => p.name === 'knowledge:read')?.id || ''
      if (resourcePath === '/') return permissions.find(p => p.name === 'dashboard:read')?.id || ''
    } else {
      // Backend API
      const parts = resourcePath.split(' ')
      if (parts.length >= 2) {
        const path = parts[1]
        if (path.includes('scan')) return permissions.find(p => p.name === 'scan:read')?.id || ''
        if (path.includes('report')) return permissions.find(p => p.name === 'report:read')?.id || ''
        if (path.includes('user')) return permissions.find(p => p.name === 'user:read')?.id || ''
        if (path.includes('settings')) return permissions.find(p => p.name === 'settings:read')?.id || ''
      }
    }
    return ''
  }

  const frontendResources = unmappedResources.filter(r => r.resource_type === 'frontend_page')
  const backendResources = unmappedResources.filter(r => r.resource_type === 'backend_api')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/roles')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('common.back') || 'Back to Roles'}
        </button>
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('unmappedResources.title') || 'Unmapped Resources'}
            </h1>
            <p className="text-gray-600 mt-1">
              {t('unmappedResources.subtitle') || 'Resources not bound to any permission. Map them to ensure proper access control.'}
            </p>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-green-800">{successMessage}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-5 h-5 text-blue-600" />
            <span className="font-medium text-gray-700">Frontend Pages</span>
          </div>
          <span className="text-2xl font-bold text-gray-900">{frontendResources.length}</span>
          <span className="text-gray-500 text-sm ml-2">unmapped</span>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-5 h-5 text-green-600" />
            <span className="font-medium text-gray-700">Backend APIs</span>
          </div>
          <span className="text-2xl font-bold text-gray-900">{backendResources.length}</span>
          <span className="text-gray-500 text-sm ml-2">unmapped</span>
        </div>
      </div>

      {/* Frontend Pages Section */}
      {frontendResources.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200 mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-600" />
              Frontend Pages ({frontendResources.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {frontendResources.map((resource) => (
              <div key={resource.resource_path} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">{resource.resource_path}</code>
                    <span className="text-gray-500 text-sm ml-2">{resource.reason}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {showMappingForm === resource.resource_path ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedPermission}
                          onChange={(e) => setSelectedPermission(e.target.value)}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        >
                          <option value="">Select permission...</option>
                          {permissions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.scope}:{p.action})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleCreateMapping(resource.resource_path, 'frontend_page')}
                          disabled={!selectedPermission || actionLoading === resource.resource_path}
                          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                          {actionLoading === resource.resource_path ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Link2 className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setShowMappingForm(null)
                            setSelectedPermission('')
                          }}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setShowMappingForm(resource.resource_path)
                          const recommended = getRecommendedPermission(resource.resource_path, 'frontend_page')
                          setSelectedPermission(recommended)
                        }}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Map Permission
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backend APIs Section */}
      {backendResources.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Server className="w-5 h-5 text-green-600" />
              Backend APIs ({backendResources.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
            {backendResources.map((resource) => (
              <div key={resource.resource_path} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">{resource.resource_path}</code>
                    <span className="text-gray-500 text-sm ml-2">{resource.reason}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {showMappingForm === resource.resource_path ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedPermission}
                          onChange={(e) => setSelectedPermission(e.target.value)}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        >
                          <option value="">Select permission...</option>
                          {permissions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.scope}:{p.action})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleCreateMapping(resource.resource_path, 'backend_api')}
                          disabled={!selectedPermission || actionLoading === resource.resource_path}
                          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                          {actionLoading === resource.resource_path ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Link2 className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setShowMappingForm(null)
                            setSelectedPermission('')
                          }}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setShowMappingForm(resource.resource_path)
                          const recommended = getRecommendedPermission(resource.resource_path, 'backend_api')
                          setSelectedPermission(recommended)
                        }}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Map Permission
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {unmappedResources.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow border border-gray-200">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">All Resources Mapped</h3>
          <p className="text-gray-500 mt-1">All frontend pages and backend APIs are properly bound to permissions.</p>
        </div>
      )}
    </div>
  )
}