import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { Shield, Lock, Mail, User } from 'lucide-react'

export default function RegisterPage() {
  const { t } = useTranslation()
  const { register } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('register.passwordMismatch'))
      return
    }
    if (password.length < 6) {
      setError(t('register.passwordTooShort'))
      return
    }

    setSubmitting(true)
    try {
      await register(email, password, fullName || undefined)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || t('register.registrationFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-primary-500/20 rounded-2xl flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">{t('login.title')}</h1>
          <p className="text-dark-400 mt-2">{t('register.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-dark-800/50 border border-dark-700 rounded-xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">
              <User className="w-4 h-4 inline mr-1.5" />
              {t('usersManagement.fullName')}
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-white placeholder-dark-400 focus:outline-none focus:border-primary-500 transition-colors"
              placeholder={t('register.fullNamePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">
              <Mail className="w-4 h-4 inline mr-1.5" />
              {t('login.email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-white placeholder-dark-400 focus:outline-none focus:border-primary-500 transition-colors"
              placeholder={t('register.emailPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">
              <Lock className="w-4 h-4 inline mr-1.5" />
              {t('login.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-white placeholder-dark-400 focus:outline-none focus:border-primary-500 transition-colors"
              placeholder={t('login.passwordPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">
              <Lock className="w-4 h-4 inline mr-1.5" />
              {t('usersManagement.confirmPassword')}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-white placeholder-dark-400 focus:outline-none focus:border-primary-500 transition-colors"
              placeholder={t('login.passwordPlaceholder')}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary-600 hover:bg-primary-500 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t('register.creatingAccount') : t('register.createAccount')}
          </button>

          <div className="text-center text-sm text-dark-400">
            {t('register.alreadyHaveAccount')}{' '}
            <Link to="/login" className="text-primary-400 hover:text-primary-300">
              {t('register.signIn')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
