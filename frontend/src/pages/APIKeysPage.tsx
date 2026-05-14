import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Key, Trash2, Plus, Copy, AlertCircle } from 'lucide-react'
import api from '../services/api'

interface APIKey {
  id: string
  name: string
  key_hash: string
  created_at: string
  last_used: string | null
  expires_at: string | null
}

export default function APIKeysPage() {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<APIKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [, setNewKey] = useState<{ name: string; key: string } | null>(null)
  const [showNewKey, setShowNewKey] = useState<string | null>(null)

  useEffect(() => { fetchKeys() }, [])

  const fetchKeys = async () => {
    try {
      const res = await api.get('/api-keys')
      setKeys(res.data)
    } catch (error) {
      console.error('Failed to fetch API keys:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    try {
      const res = await api.post('/api-keys', { name })
      setNewKey({ name, key: res.data.key })
      setShowNewKey(res.data.key)
      setShowCreateModal(false)
      fetchKeys()
    } catch (error) {
      alert(t('apiKeys.createFailed'))
    }
  }

  const handleDelete = async (keyId: string) => {
    if (!confirm(t('apiKeys.deleteConfirm'))) return
    try {
      await api.delete(`/api-keys/${keyId}`)
      setKeys(keys.filter(k => k.id !== keyId))
    } catch (error) {
      alert(t('apiKeys.deleteFailed'))
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert(t('apiKeys.copiedToClipboard'))
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('apiKeys.title')}</h1>
          <p className="text-dark-400 mt-1">{t('apiKeys.subtitle')}</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('apiKeys.createKey')}
        </button>
      </div>

      {showNewKey && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800">{t('apiKeys.saveYourKey')}</h3>
              <p className="text-sm text-yellow-700 mt-1">{t('apiKeys.keyOnlyShownOnce')}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="bg-yellow-100 px-3 py-1 rounded text-sm font-mono">{showNewKey}</code>
                <button onClick={() => copyToClipboard(showNewKey)} className="p-1 hover:bg-yellow-100 rounded"><Copy className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-dark-800 rounded-lg shadow-sm border border-dark-700">
        <div className="p-4 border-b border-dark-700 flex items-center gap-2">
          <Key className="w-5 h-5 text-dark-400" />
          <span className="font-medium text-white">{t('apiKeys.myKeys')} ({keys.length})</span>
        </div>
        {keys.length === 0 ? (
          <div className="p-8 text-center text-dark-400">{t('apiKeys.noKeys')}</div>
        ) : (
          <table className="min-w-full divide-y divide-dark-700">
            <thead className="bg-dark-900/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{t('apiKeys.name')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{t('apiKeys.keyHash')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{t('apiKeys.createdAt')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{t('apiKeys.lastUsed')}</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-dark-400 uppercase tracking-wider">{t('apiKeys.actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-dark-800 divide-y divide-dark-700">
              {keys.map(key => (
                <tr key={key.id} className="hover:bg-dark-700/50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{key.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-dark-400 font-mono">{key.key_hash.slice(0, 16)}...</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-dark-400">{new Date(key.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-dark-400">{key.last_used ? new Date(key.last_used).toLocaleString() : t('apiKeys.neverUsed')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => handleDelete(key.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-lg p-6 w-96 border border-dark-700">
            <h3 className="text-lg font-medium mb-4 text-white">{t('apiKeys.createNewKey')}</h3>
            <form onSubmit={handleCreate}>
              <input name="name" placeholder={t('apiKeys.keyName')} className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-md mb-4 text-white placeholder-dark-500" required />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-dark-300 bg-dark-700 rounded-md hover:bg-dark-600">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600">{t('common.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
