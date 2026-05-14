import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../locales'
import { User, Lock, CheckCircle, XCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import axios from 'axios'

export default function UserProfilePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await axios.put('/api/v1/auth/me', { full_name: fullName })
      setMessage({ type: 'success', text: t('profile.updateSuccess') })
      setEditing(false)
      window.location.reload()
    } catch {
      setMessage({ type: 'error', text: t('profile.updateFailed') })
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('register.passwordMismatch') })
      return
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: t('register.passwordTooShort') })
      return
    }
    try {
      await axios.put('/api/v1/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setMessage({ type: 'success', text: t('profile.passwordChanged') })
      setChangingPassword(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || t('profile.changeFailed') })
    }
  }

  const roleLabels = { admin: t('usersManagement.admin'), user: t('usersManagement.user'), viewer: t('usersManagement.viewer') }
  const roleColors = { admin: 'bg-red-500/20 text-red-400', user: 'bg-blue-500/20 text-blue-400', viewer: 'bg-dark-500/40 text-dark-300' }

  if (!user) return <div className="flex items-center justify-center h-64"><p className="text-dark-400">{t('common.loading')}</p></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('profile.title')}</h1>
        <p className="text-dark-400 mt-1">{t('profile.subtitle')}</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto text-dark-400 hover:text-white">&times;</button>
        </div>
      )}

      {/* Profile Card */}
      <div className="bg-dark-800 rounded-lg border border-dark-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium flex items-center gap-2 text-white"><User className="w-5 h-5 text-primary-400" /> {t('profile.personalInfo')}</h2>
          {!editing && <button onClick={() => setEditing(true)} className="text-sm text-primary-400 hover:text-primary-300">{t('common.edit')}</button>}
        </div>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-primary-500/20 rounded-full flex items-center justify-center text-2xl font-bold text-primary-400">
            {(user.full_name || user.email)[0].toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-medium text-white">{user.full_name || '-'}</p>
            <p className="text-dark-400">{user.email}</p>
          </div>
        </div>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">{t('usersManagement.fullName')}</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} disabled={!editing} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md disabled:bg-dark-800 text-white placeholder-dark-400 focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">{t('login.email')}</label>
              <input value={user.email} disabled className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-md text-dark-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">{t('usersManagement.role')}</label>
              <span className={`px-3 py-2 inline-flex text-sm font-semibold rounded-full ${roleColors[user.role as keyof typeof roleColors]}`}>
                {roleLabels[user.role as keyof typeof roleLabels]}
              </span>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">{t('usersManagement.createdAt')}</label>
              <p className="px-3 py-2 text-dark-400">{new Date(user.created_at).toLocaleString(i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US')}</p>
            </div>
          </div>
          {editing && (
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setEditing(false); setFullName(user.full_name || '') }} className="px-4 py-2 text-dark-300 bg-dark-700 rounded-md hover:bg-dark-600">{t('common.cancel')}</button>
              <button type="submit" className="px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600">{t('common.save')}</button>
            </div>
          )}
        </form>
      </div>

      {/* Change Password Card */}
      <div className="bg-dark-800 rounded-lg border border-dark-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium flex items-center gap-2 text-white"><Lock className="w-5 h-5 text-primary-400" /> {t('profile.changePassword')}</h2>
          {!changingPassword && <button onClick={() => setChangingPassword(true)} className="text-sm text-primary-400 hover:text-primary-300">{t('common.edit')}</button>}
        </div>
        {changingPassword && (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">{t('profile.currentPassword')}</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white placeholder-dark-400 focus:outline-none focus:border-primary-500" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">{t('profile.newPassword')}</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white placeholder-dark-400 focus:outline-none focus:border-primary-500" required minLength={6} />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">{t('profile.confirmNewPassword')}</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white placeholder-dark-400 focus:outline-none focus:border-primary-500" required minLength={6} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setChangingPassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('') }} className="px-4 py-2 text-dark-300 bg-dark-700 rounded-md hover:bg-dark-600">{t('common.cancel')}</button>
              <button type="submit" className="px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600">{t('profile.confirmChange')}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
