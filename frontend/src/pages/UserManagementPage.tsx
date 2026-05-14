import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield, Trash2, RotateCcw, UserCheck, UserX, Users, Key } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

interface User {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'user' | 'viewer' | 'service'
  is_active: boolean
  created_at: string
  last_login: string | null
}

export default function UserManagementPage() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showResetModal, setShowResetModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [showServiceNotice, setShowServiceNotice] = useState(false)

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      navigate('/')
      return
    }
    fetchUsers()
  }, [currentUser, navigate])

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users')
      setUsers(res.data)
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm(t('usersManagement.deleteConfirm'))) return
    try {
      await api.delete(`/users/${userId}`)
      setUsers(users.filter(u => u.id !== userId))
    } catch (error) {
      console.error('Failed to delete user:', error)
      alert(t('usersManagement.deleteFailed'))
    }
  }

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      await api.put(`/users/${userId}`, { is_active: !currentActive })
      setUsers(users.map(u => u.id === userId ? { ...u, is_active: !currentActive } : u))
    } catch (error) {
      console.error('Failed to toggle user status:', error)
      alert(t('usersManagement.operationFailed'))
    }
  }

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword) return
    try {
      await api.post(`/users/${selectedUser.id}/reset-password`, { new_password: newPassword })
      setShowResetModal(false)
      setNewPassword('')
      setSelectedUser(null)
      alert(t('usersManagement.passwordReset'))
    } catch (error) {
      console.error('Failed to reset password:', error)
      alert(t('usersManagement.resetPasswordFailed'))
    }
  }

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCreateError(null)
    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const fullName = formData.get('full_name') as string
    const role = formData.get('role') as 'admin' | 'user' | 'viewer' | 'service'

    if (password.length < 6) {
      setCreateError('密码长度至少为6位')
      return
    }

    try {
      await api.post('/users', { email, password, full_name: fullName, role })
      setShowCreateModal(false)
      if (role === 'service') {
        setShowServiceNotice(true)
      }
      fetchUsers()
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (typeof detail === 'string') {
        setCreateError(detail)
      } else if (Array.isArray(detail)) {
        setCreateError(detail.map((d: any) => d.msg || d).join(', '))
      } else {
        setCreateError(t('usersManagement.createUserFailed'))
      }
    }
  }

  const roleLabels: Record<string, string> = {
    admin: t('usersManagement.admin'),
    user: t('usersManagement.user'),
    viewer: t('usersManagement.viewer'),
    service: 'Service'
  }
  const roleColors: Record<string, string> = {
    admin: 'bg-red-100 text-red-800',
    user: 'bg-blue-100 text-blue-800',
    viewer: 'bg-gray-100 text-gray-800',
    service: 'bg-purple-100 text-purple-800'
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div></div>

  // Validate users data to prevent rendering errors
  const validUsers = users.filter(u => u && typeof u === 'object' && u.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('usersManagement.title')}</h1>
          <p className="text-dark-400 mt-1">{t('usersManagement.subtitle')}</p>
        </div>
        <button onClick={() => { setCreateError(null); setShowCreateModal(true) }} className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-2">
          <Shield className="w-4 h-4" /> {t('usersManagement.createUser')}
        </button>
      </div>

      <div className="bg-dark-800 rounded-lg shadow-sm border border-dark-700">
        <div className="p-4 border-b border-dark-700 flex items-center gap-2">
          <Users className="w-5 h-5 text-dark-400" />
          <span className="font-medium text-white">{t('usersManagement.userList')} ({validUsers.length})</span>
        </div>
        <table className="min-w-full divide-y divide-dark-700">
          <thead className="bg-dark-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{t('usersManagement.user')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{t('usersManagement.role')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{t('usersManagement.status')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{t('usersManagement.lastLogin')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-dark-400 uppercase tracking-wider">{t('usersManagement.actions')}</th>
            </tr>
          </thead>
          <tbody className="bg-dark-800 divide-y divide-dark-700">
            {validUsers.map(user => (
              <tr key={user.id} className="hover:bg-dark-700/50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 font-medium">
                      {((user.full_name && user.full_name.trim()) ? user.full_name : user.email)[0].toUpperCase()}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-white">{user.full_name || '-'}</div>
                      <div className="text-sm text-dark-400">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${roleColors[user.role] || 'bg-gray-100 text-gray-800'}`}>
                    {roleLabels[user.role] || user.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {user.is_active ? (
                    <span className="text-green-400 flex items-center gap-1"><UserCheck className="w-4 h-4" /> {t('usersManagement.active')}</span>
                  ) : (
                    <span className="text-red-400 flex items-center gap-1"><UserX className="w-4 h-4" /> {t('usersManagement.disabled')}</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-dark-400">
                  {user.last_login ? new Date(user.last_login).toLocaleString() : t('usersManagement.neverLoggedIn')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => { setSelectedUser(user); setShowResetModal(true) }} className="text-emerald-400 hover:text-emerald-300 mr-3" title={t('usersManagement.resetPassword')}><RotateCcw className="w-4 h-4" /></button>
                  <button onClick={() => handleToggleActive(user.id, user.is_active)} className={`${user.is_active ? 'text-yellow-400 hover:text-yellow-300' : 'text-green-400 hover:text-green-300'} mr-3`} title={user.is_active ? t('common.disable') : t('common.enable')}>
                    {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  </button>
                  {user.id !== currentUser?.id && (
                    <button onClick={() => handleDeleteUser(user.id)} className="text-red-400 hover:text-red-300" title={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showResetModal && selectedUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-lg p-6 w-96 border border-dark-700">
            <h3 className="text-lg font-medium mb-4 text-white">{t('usersManagement.resetPassword')} - {selectedUser.email}</h3>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('usersManagement.enterNewPassword')} className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-md mb-4 text-white placeholder-dark-500" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowResetModal(false); setNewPassword(''); setSelectedUser(null) }} className="px-4 py-2 text-dark-300 bg-dark-700 rounded-md hover:bg-dark-600">{t('common.cancel')}</button>
              <button onClick={handleResetPassword} className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600">{t('usersManagement.confirmReset')}</button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-lg p-6 w-96 border border-dark-700">
            <h3 className="text-lg font-medium mb-4 text-white">{t('usersManagement.createNewUser')}</h3>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <input name="full_name" placeholder={t('usersManagement.fullName')} className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-md text-white placeholder-dark-500" required />
              <input name="email" type="email" placeholder={t('usersManagement.email')} className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-md text-white placeholder-dark-500" required />
              <input name="password" type="password" placeholder={t('usersManagement.password') + '（至少6位）'} className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-md text-white placeholder-dark-500" required minLength={6} />
              {createError && (
                <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
                  {createError}
                </div>
              )}
              <select name="role" className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-md text-white" defaultValue="user">
                <option value="admin">{t('usersManagement.admin')}</option>
                <option value="user">{t('usersManagement.user')}</option>
                <option value="viewer">{t('usersManagement.viewer')}</option>
                <option value="service">Service (API Only)</option>
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-dark-300 bg-dark-700 rounded-md hover:bg-dark-600">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600">{t('common.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showServiceNotice && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-lg p-6 w-[28rem] border border-dark-700">
            <div className="flex items-center gap-3 mb-4">
              <Key className="w-6 h-6 text-purple-400" />
              <h3 className="text-lg font-medium text-white">Service Account Created</h3>
            </div>
            <p className="text-dark-400 mb-4">
              The service account has been created successfully. This account can only be used for API access and cannot log in to the web interface.
            </p>
            <div className="bg-dark-900 rounded-lg p-3 mb-4 border border-dark-700">
              <p className="text-sm text-dark-400">Use the following credentials to obtain an access token via the API:</p>
              <p className="text-sm text-emerald-400 mt-2 font-mono">POST /api/v1/auth/login</p>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowServiceNotice(false)} className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600">OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
