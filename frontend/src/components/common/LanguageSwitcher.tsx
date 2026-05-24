import { useTranslation } from 'react-i18next'
import { GlobalOutlined } from '@ant-design/icons'

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation()

  const currentLang = i18n.language
  const isChinese = currentLang === 'zh-CN' || currentLang === 'zh'

  const toggleLanguage = () => {
    const newLang = isChinese ? 'en-US' : 'zh-CN'
    i18n.changeLanguage(newLang)
  }

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700/50 hover:bg-dark-600 text-dark-300 hover:text-white transition-colors text-sm"
      title={t('languageSwitcher.label')}
    >
      <GlobalOutlined className="w-4 h-4" />
      <span>{isChinese ? '中文' : 'English'}</span>
    </button>
  )
}
