import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components'
import { App as AntApp, Button, Descriptions, Radio, Space, Tag, Typography } from 'antd'
import { CheckOutlined, GlobalOutlined, SaveOutlined, TranslationOutlined } from '@ant-design/icons'
import i18n from '../../locales'

const { Text } = Typography

const availableLanguages = [
  { code: 'zh-CN', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'en-US', name: 'English', nativeName: 'English', flag: '🇺🇸' },
]

function LanguageStatisticCards({ currentLanguageName, t }: {
  currentLanguageName: string
  t: ReturnType<typeof useTranslation>['t']
}) {
  return (
    <StatisticCard.Group direction="row">
      <StatisticCard statistic={{ title: t('languageManagement.interfaceLanguage', 'Interface Language'), value: currentLanguageName, icon: <GlobalOutlined /> }} />
      <StatisticCard statistic={{ title: t('languageManagement.translationProgress', 'Translation Progress'), value: '100%', icon: <TranslationOutlined /> }} />
      <StatisticCard statistic={{ title: t('languageManagement.lastUpdated', 'Last Updated'), value: '2026-05-03', icon: <CheckOutlined /> }} />
    </StatisticCard.Group>
  )
}

export default function LanguagesPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const [selectedLang, setSelectedLang] = useState(i18n.language)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setSelectedLang(i18n.language)
  }, [])

  const currentLanguage = availableLanguages.find(lang => lang.code === i18n.language) || availableLanguages[0]
  const selectedLanguage = availableLanguages.find(lang => lang.code === selectedLang) || currentLanguage

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await i18n.changeLanguage(selectedLang)
      notification.success({ message: t('common.save', 'Saved') })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageContainer
      title={t('languageManagement.title', 'Language Management')}
      subTitle={t('languageManagement.description', 'Manage interface language and translation settings')}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ProCard bordered>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center" wrap>
            <Space direction="vertical" size={4}>
              <Text strong>{t('languageManagement.title', 'Language Management')}</Text>
              <Text type="secondary">{t('languageManagement.description', 'Manage interface language and translation settings')}</Text>
            </Space>
            <Tag color="green" icon={<CheckOutlined />}>100%</Tag>
          </Space>
        </ProCard>

        <LanguageStatisticCards currentLanguageName={currentLanguage.nativeName} t={t} />

        <ProCard
          bordered
          title={<Space><GlobalOutlined />{t('languageManagement.selectLanguage', 'Select Language')}</Space>}
          extra={(
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={isSaving}
              disabled={selectedLang === i18n.language}
              onClick={handleSave}
            >
              {t('common.save', 'Save')}
            </Button>
          )}
        >
          <Radio.Group value={selectedLang} onChange={event => setSelectedLang(event.target.value)} style={{ width: '100%' }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {availableLanguages.map(lang => (
                <ProCard
                  key={lang.code}
                  bordered
                  hoverable
                  size="small"
                  onClick={() => setSelectedLang(lang.code)}
                  style={{ borderColor: selectedLang === lang.code ? '#1677ff' : undefined }}
                >
                  <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center">
                    <Radio value={lang.code}>
                      <Space>
                        <Text style={{ fontSize: 24 }}>{lang.flag}</Text>
                        <Space direction="vertical" size={0}>
                          <Text strong>{lang.nativeName} ({lang.name})</Text>
                          <Text type="secondary">{lang.code}</Text>
                        </Space>
                      </Space>
                    </Radio>
                    {selectedLang === lang.code && <Tag color="blue" icon={<CheckOutlined />}>{t('common.selected', 'Selected')}</Tag>}
                  </Space>
                </ProCard>
              ))}
            </Space>
          </Radio.Group>
        </ProCard>

        <ProCard bordered title={<Space><TranslationOutlined />{t('languageManagement.languageStatus', 'Language Status')}</Space>}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('languageManagement.interfaceLanguage', 'Interface Language')}>
              {currentLanguage.nativeName}
            </Descriptions.Item>
            <Descriptions.Item label={t('languageManagement.translationProgress', 'Translation Progress')}>
              <Tag color="green">100%</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('languageManagement.lastUpdated', 'Last Updated')}>
              2026-05-03
            </Descriptions.Item>
            <Descriptions.Item label={t('languageManagement.selectedLanguage', 'Selected Language')}>
              {selectedLanguage.nativeName} ({selectedLanguage.code})
            </Descriptions.Item>
          </Descriptions>
        </ProCard>
      </Space>
    </PageContainer>
  )
}
