import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Check, Save } from 'lucide-react'
import { useUIStore } from '../store'
import i18n from '../locales'

const availableLanguages = [
  { code: 'zh-CN', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'en-US', name: 'English', nativeName: 'English', flag: '🇺🇸' },
]

export default function LanguagesPage() {
  const { t } = useTranslation()
  const uiStore = useUIStore() as any
  const language = uiStore.language
  const setLanguage = uiStore.setLanguage
  const [selectedLang, setSelectedLang] = useState(language || i18n.language)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    setSelectedLang(i18n.language)
  }, [i18n.language])

  const handleSave = async () => {
    setIsSaving(true)
    await i18n.changeLanguage(selectedLang)
    setLanguage(selectedLang)
    setSaveSuccess(true)
    setIsSaving(false)
    setTimeout(() => setSaveSuccess(false), 2000)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">
          <Globe className="w-6 h-6 inline-block mr-2" />
          {t('languageManagement.title', 'Language Management')}
        </h1>
        <p className="text-dark-400">
          {t('languageManagement.description', 'Manage interface language and translation settings')}
        </p>
      </div>

      <div className="bg-dark-800 rounded-lg border border-dark-900/50 p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          {t('languageManagement.selectLanguage', 'Select Language')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {availableLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setSelectedLang(lang.code)}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                selectedLang === lang.code
                  ? 'border-primary-500 bg-primary-500/10'
                  : 'border-dark-700 hover:border-dark-600 bg-dark-900/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{lang.flag}</span>
                <div className="flex-1">
                  <div className="font-semibold text-white">
                    {lang.nativeName} ({lang.name})
                  </div>
                  <div className="text-sm text-dark-400">{lang.code}</div>
                </div>
                {selectedLang === lang.code && (
                  <Check className="w-5 h-5 text-primary-500" />
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-dark-700">
          <div className="text-sm text-dark-400">
            {t('languageManagement.currentLanguage', 'Current Language')}: <span className="text-white font-medium">{availableLanguages.find(l => l.code === i18n.language)?.nativeName}</span>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving || selectedLang === i18n.language}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              isSaving || selectedLang === i18n.language
                ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                : 'bg-primary-500 hover:bg-primary-600 text-white'
            }`}
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                {t('common.save', 'Saving...')}
              </>
            ) : saveSuccess ? (
              <>
                <Check className="w-4 h-4" />
                {t('common.save', 'Saved')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t('common.save', 'Save')}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-dark-800 rounded-lg border border-dark-900/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          {t('languageManagement.languageStatus', 'Language Status')}
        </h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-dark-700">
            <span className="text-dark-400">{t('languageManagement.interfaceLanguage', 'Interface Language')}</span>
            <span className="text-white font-medium">{availableLanguages.find(l => l.code === i18n.language)?.nativeName}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-dark-700">
            <span className="text-dark-400">{t('languageManagement.translationProgress', 'Translation Progress')}</span>
            <span className="text-green-500">100%</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-dark-400">{t('languageManagement.lastUpdated', 'Last Updated')}</span>
            <span className="text-white">2026-05-03</span>
          </div>
        </div>
      </div>
    </div>
  )
}
