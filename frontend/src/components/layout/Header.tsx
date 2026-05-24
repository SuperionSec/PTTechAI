import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { LogoutOutlined, UserOutlined, SettingOutlined, GlobalOutlined } from '@ant-design/icons'
import { useState } from 'react'
import i18n from '../../locales'

const pageTitles: Record<string, string> = {
  '/': 'pages.dashboard',
  '/scan/new': 'pages.newScan',
  '/reports': 'pages.reports',
  '/settings': 'pages.settings',
  '/full-ia': 'pages.fullIaTesting',
  '/users': 'usersManagement.title',
  '/profile': 'usersManagement.title',
  '/api-keys': 'apiKeys.title',
  '/languages': 'languageManagement.title',
}

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const [showMenu, setShowMenu] = useState(false)
  const titleKey = pageTitles[location.pathname] || 'sidebar.title'

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN'
    i18n.changeLanguage(newLang)
  }

  return (
    <header className="h-16 bg-dark-800 border-b border-dark-900/50 flex items-center justify-between px-6">
      <h1 className="text-xl font-semibold text-white">{t(titleKey)}</h1>
      <div className="flex items-center gap-4">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-dark-300 hover:text-white hover:bg-dark-700 transition-colors"
          title={t('languageSwitcher.label')}
        >
          <GlobalOutlined className="w-4 h-4" />
          <span>{i18n.language === 'zh-CN' ? '中文' : 'EN'}</span>
        </button>
        <span className="text-sm text-dark-400">
          {new Date().toLocaleDateString(i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </span>
        {user && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 pl-4 border-l border-dark-700 hover:bg-dark-700 rounded-lg p-1 transition-colors"
            >
              <div className="w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center">
                <UserOutlined className="w-4 h-4 text-primary-400" />
              </div>
              <div className="text-sm text-left">
                <p className="text-white font-medium">{user.full_name || user.email}</p>
                <p className="text-dark-400 text-xs">{t('common.role_' + user.role, user.role)}</p>
              </div>
              <svg className="w-4 h-4 text-dark-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-dark-800 rounded-lg shadow-lg border border-dark-700 z-50">
                <div className="p-3 border-b border-dark-700">
                  <p className="text-sm font-medium text-white">{user.full_name || user.email}</p>
                  <p className="text-xs text-dark-400">{user.email}</p>
                </div>
                <div className="py-1">
                  <button onClick={() => { navigate('/profile'); setShowMenu(false) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark-300 hover:text-white hover:bg-dark-700">
                    <SettingOutlined className="w-4 h-4" /> {t('profile.title')}
                  </button>
                  <button onClick={() => { logout(); setShowMenu(false); navigate('/login') }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 border-t border-dark-700">
                    <LogoutOutlined className="w-4 h-4" /> {t('auth.logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
