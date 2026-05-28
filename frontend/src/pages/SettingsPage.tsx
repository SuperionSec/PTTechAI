import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components'
import {
  App as AntApp,
  Button,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd'
import api from '../services/api'
import {
  BellOutlined,
  CheckCircleOutlined,
  CloudOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  MessageOutlined,
  PhoneOutlined,
  ReloadOutlined,
  RocketOutlined,
  BranchesOutlined,
  SaveOutlined,
  SecurityScanOutlined,
  SendOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

const { Paragraph, Text } = Typography

interface Settings {
  llm_provider: string
  llm_model: string
  has_anthropic_key: boolean
  has_openai_key: boolean
  has_openrouter_key: boolean
  has_gemini_key: boolean
  has_together_key: boolean
  has_fireworks_key: boolean
  ollama_base_url: string
  lmstudio_base_url: string
  max_concurrent_scans: number
  aggressive_mode: boolean
  default_scan_type: string
  recon_enabled_by_default: boolean
  enable_model_routing: boolean
  enable_knowledge_augmentation: boolean
  enable_browser_validation: boolean
  max_output_tokens: number | null
  enable_notifications: boolean
  has_discord_webhook: boolean
  has_telegram_bot: boolean
  has_twilio_credentials: boolean
  notification_severity_filter: string
}

interface DbStats {
  scans: number
  vulnerabilities: number
  endpoints: number
  reports: number
}

interface ModelInfo {
  model_id: string
  display_name: string
  size?: string
  context_length?: number
  is_local: boolean
}

const PROVIDERS = [
  { id: 'claude', label: 'Claude' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'together', label: 'Together AI' },
  { id: 'fireworks', label: 'Fireworks AI' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'lmstudio', label: 'LM Studio' },
]

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [dbStats, setDbStats] = useState<DbStats | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [togetherKey, setTogetherKey] = useState('')
  const [fireworksKey, setFireworksKey] = useState('')
  const [ollamaUrl, setOllamaUrl] = useState('')
  const [lmstudioUrl, setLmstudioUrl] = useState('')
  const [llmProvider, setLlmProvider] = useState('claude')
  const [llmModel, setLlmModel] = useState('')
  const [maxConcurrentScans, setMaxConcurrentScans] = useState(3)
  const [maxOutputTokens, setMaxOutputTokens] = useState<number | null>(null)
  const [aggressiveMode, setAggressiveMode] = useState(false)
  const [enableModelRouting, setEnableModelRouting] = useState(false)
  const [enableKnowledgeAugmentation, setEnableKnowledgeAugmentation] = useState(false)
  const [enableBrowserValidation, setEnableBrowserValidation] = useState(false)
  const [enableNotifications, setEnableNotifications] = useState(false)
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')
  const [twilioAccountSid, setTwilioAccountSid] = useState('')
  const [twilioAuthToken, setTwilioAuthToken] = useState('')
  const [twilioFromNumber, setTwilioFromNumber] = useState('')
  const [twilioToNumber, setTwilioToNumber] = useState('')
  const [notificationSeverityFilter, setNotificationSeverityFilter] = useState('critical,high')
  const [isSaving, setIsSaving] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [refreshSpinning, setRefreshSpinning] = useState(false)
  const [statsRefreshing, setStatsRefreshing] = useState(false)
  const [testingChannel, setTestingChannel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const activeProviderLabel = useMemo(() => PROVIDERS.find(p => p.id === llmProvider)?.label || llmProvider, [llmProvider])
  const totalDbRecords = useMemo(() => dbStats ? dbStats.scans + dbStats.vulnerabilities + dbStats.endpoints + dbStats.reports : 0, [dbStats])
  const enabledFeaturesCount = useMemo(() => [enableModelRouting, enableKnowledgeAugmentation, enableBrowserValidation].filter(Boolean).length, [enableModelRouting, enableKnowledgeAugmentation, enableBrowserValidation])

  const hasApiKeyForProvider = useMemo((): boolean => {
    if (!settings) return false
    const keyMap: Record<string, boolean> = {
      claude: settings.has_anthropic_key,
      openai: settings.has_openai_key,
      gemini: settings.has_gemini_key,
      openrouter: settings.has_openrouter_key,
      together: settings.has_together_key,
      fireworks: settings.has_fireworks_key,
      ollama: true,
      lmstudio: true,
    }
    return keyMap[llmProvider] ?? false
  }, [settings, llmProvider])

  const fetchSettings = useCallback(async () => {
    try {
      const response = await api.get<Settings>('/settings')
      const data = response.data
      setSettings(data)
      setLlmProvider(data.llm_provider)
      setLlmModel(data.llm_model || '')
      setMaxConcurrentScans(data.max_concurrent_scans)
      setAggressiveMode(data.aggressive_mode)
      setEnableModelRouting(data.enable_model_routing ?? false)
      setEnableKnowledgeAugmentation(data.enable_knowledge_augmentation ?? false)
      setEnableBrowserValidation(data.enable_browser_validation ?? false)
      setMaxOutputTokens(data.max_output_tokens)
      setOllamaUrl(data.ollama_base_url || '')
      setLmstudioUrl(data.lmstudio_base_url || '')
      setEnableNotifications(data.enable_notifications ?? false)
      setNotificationSeverityFilter(data.notification_severity_filter || 'critical,high')
    } catch (error) {
      console.error('Failed to fetch settings:', error)
      notification.error({ message: t('settings.failedToLoadSettings') })
    } finally {
      setLoading(false)
    }
  }, [notification, t])

  const fetchDbStats = useCallback(async () => {
    try {
      const response = await api.get<DbStats>('/settings/stats')
      setDbStats(response.data)
    } catch (error) {
      console.error('Failed to fetch db stats:', error)
    }
  }, [])

  const fetchModels = useCallback(async (provider: string) => {
    setLoadingModels(true)
    try {
      const response = await api.get<{ models?: ModelInfo[] }>(`/settings/models/${provider}`)
      setAvailableModels(response.data.models || [])
    } catch {
      setAvailableModels([])
    } finally {
      setLoadingModels(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
    fetchDbStats()
  }, [fetchSettings, fetchDbStats])

  useEffect(() => {
    fetchModels(llmProvider)
  }, [llmProvider, fetchModels])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const body: Record<string, unknown> = {
        llm_provider: llmProvider,
        llm_model: llmModel || undefined,
        max_concurrent_scans: maxConcurrentScans,
        aggressive_mode: aggressiveMode,
        enable_model_routing: enableModelRouting,
        enable_knowledge_augmentation: enableKnowledgeAugmentation,
        enable_browser_validation: enableBrowserValidation,
        max_output_tokens: maxOutputTokens,
        enable_notifications: enableNotifications,
        notification_severity_filter: notificationSeverityFilter,
      }

      if (discordWebhookUrl) body.discord_webhook_url = discordWebhookUrl
      if (telegramBotToken) body.telegram_bot_token = telegramBotToken
      if (telegramChatId) body.telegram_chat_id = telegramChatId
      if (twilioAccountSid) body.twilio_account_sid = twilioAccountSid
      if (twilioAuthToken) body.twilio_auth_token = twilioAuthToken
      if (twilioFromNumber) body.twilio_from_number = twilioFromNumber
      if (twilioToNumber) body.twilio_to_number = twilioToNumber
      if (apiKey) body.anthropic_api_key = apiKey
      if (openaiKey) body.openai_api_key = openaiKey
      if (openrouterKey) body.openrouter_api_key = openrouterKey
      if (geminiKey) body.gemini_api_key = geminiKey
      if (togetherKey) body.together_api_key = togetherKey
      if (fireworksKey) body.fireworks_api_key = fireworksKey
      if (ollamaUrl) body.ollama_base_url = ollamaUrl
      if (lmstudioUrl) body.lmstudio_base_url = lmstudioUrl

      const response = await api.put<Settings>('/settings', body)
      setSettings(response.data)
      setApiKey('')
      setOpenaiKey('')
      setOpenrouterKey('')
      setGeminiKey('')
      setTogetherKey('')
      setFireworksKey('')
      setDiscordWebhookUrl('')
      setTelegramBotToken('')
      setTelegramChatId('')
      setTwilioAccountSid('')
      setTwilioAuthToken('')
      setTwilioFromNumber('')
      setTwilioToNumber('')
      notification.success({ message: t('settings.savedSuccessfully') })
    } catch {
      notification.error({ message: t('settings.failedToSaveSettings') })
    } finally {
      setIsSaving(false)
    }
  }, [
    llmProvider, llmModel, maxConcurrentScans, aggressiveMode,
    enableModelRouting, enableKnowledgeAugmentation, enableBrowserValidation,
    maxOutputTokens, enableNotifications, notificationSeverityFilter,
    discordWebhookUrl, telegramBotToken, telegramChatId,
    twilioAccountSid, twilioAuthToken, twilioFromNumber, twilioToNumber,
    apiKey, openaiKey, openrouterKey, geminiKey, togetherKey, fireworksKey,
    ollamaUrl, lmstudioUrl, notification, t,
  ])

  const handleClearDatabase = useCallback(async () => {
    setIsClearing(true)
    try {
      await api.post('/settings/clear-database', { confirm: true })
      notification.success({ message: t('settings.databaseCleared') })
      await fetchDbStats()
    } catch {
      notification.error({ message: t('settings.failedToClearDatabase') })
    } finally {
      setIsClearing(false)
    }
  }, [fetchDbStats, notification, t])

  const handleTestNotification = useCallback(async (channel: string) => {
    setTestingChannel(channel)
    try {
      const response = await api.post<{ success?: boolean; message?: string; error?: string }>(`/settings/notifications/test/${channel}`)
      const data = response.data
      if (data.success) {
        notification.success({ message: data.message || t('settings.testSentTo', { channel }) })
      } else {
        notification.error({ message: data.error || t('settings.testFailedFor', { channel }) })
      }
    } catch {
      notification.error({ message: t('settings.testFailedFor', { channel }) })
    } finally {
      setTestingChannel(null)
    }
  }, [notification, t])

  const handleRefreshModels = useCallback(() => {
    setRefreshSpinning(true)
    fetchModels(llmProvider)
    setTimeout(() => setRefreshSpinning(false), 800)
  }, [fetchModels, llmProvider])

  const handleRefreshStats = useCallback(() => {
    setStatsRefreshing(true)
    fetchDbStats()
    setTimeout(() => setStatsRefreshing(false), 800)
  }, [fetchDbStats])

  if (loading && !settings) {
    return (
      <PageContainer title={t('settings.title')}>
        <ProCard bordered><Spin style={{ display: 'block', margin: '64px auto' }} /></ProCard>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={t('settings.title')}
      subTitle={
        <Space wrap>
          <Text type="secondary">{activeProviderLabel} {t('settings.provider')}</Text>
          {hasApiKeyForProvider && <Tag color="green" icon={<CheckCircleOutlined />}>{t('settings.keyConfigured')}</Tag>}
          {enabledFeaturesCount > 0 && <Tag color="purple">{enabledFeaturesCount} {t('settings.featuresActive')}</Tag>}
        </Space>
      }
      extra={<Button type="primary" icon={<SaveOutlined />} loading={isSaving} onClick={handleSave}>{t('settings.saveSettings')}</Button>}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ProCard bordered title={<Space><CloudOutlined />{t('settings.llmConfiguration')}</Space>} subTitle={t('settings.llmConfigurationDesc')}>
          <Form layout="vertical">
            <Row gutter={16}>
              <Col xs={24} lg={12}>
                <Form.Item label={t('settings.llmProvider')}>
                  <Select
                    value={llmProvider}
                    onChange={setLlmProvider}
                    options={PROVIDERS.map(provider => ({ label: provider.label, value: provider.id }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} lg={12}>
                <Form.Item label={<Space>{t('settings.modelLabel')}{loadingModels && <Spin size="small" />}</Space>}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Select
                      value={llmModel || ''}
                      onChange={setLlmModel}
                      style={{ width: '100%' }}
                      options={[
                        { label: t('settings.providerDefault'), value: '' },
                        ...availableModels.map(model => ({
                          label: `${model.display_name}${model.size ? ` (${model.size})` : ''}${model.context_length ? ` - ${(model.context_length / 1000).toFixed(0)}k ctx` : ''}`,
                          value: model.model_id,
                        })),
                      ]}
                    />
                    <Button icon={<ReloadOutlined spin={refreshSpinning} />} onClick={handleRefreshModels} />
                  </Space.Compact>
                </Form.Item>
              </Col>
            </Row>

            {llmModel && <Paragraph type="secondary">{t('settings.selected')}: <Text code>{llmModel}</Text></Paragraph>}

            <Row gutter={16}>
              {llmProvider === 'claude' && (
                <Col xs={24} lg={12}>
                  <Form.Item label={t('settings.anthropicApiKey')} extra={settings?.has_anthropic_key ? t('settings.apiKeyConfigured') : t('settings.requiredForClaude')}>
                    <Input.Password value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={settings?.has_anthropic_key ? '••••••••••••••••' : 'sk-ant-...'} />
                  </Form.Item>
                </Col>
              )}
              {llmProvider === 'openai' && (
                <Col xs={24} lg={12}>
                  <Form.Item label={t('settings.openaiApiKey')} extra={settings?.has_openai_key ? t('settings.apiKeyConfigured') : t('settings.requiredForOpenai')}>
                    <Input.Password value={openaiKey} onChange={event => setOpenaiKey(event.target.value)} placeholder={settings?.has_openai_key ? '••••••••••••••••' : 'sk-...'} />
                  </Form.Item>
                </Col>
              )}
              {llmProvider === 'gemini' && (
                <Col xs={24} lg={12}>
                  <Form.Item label={t('settings.geminiApiKey')} extra={settings?.has_gemini_key ? t('settings.apiKeyConfigured') : t('settings.requiredForGemini')}>
                    <Input.Password value={geminiKey} onChange={event => setGeminiKey(event.target.value)} placeholder={settings?.has_gemini_key ? '••••••••••••••••' : 'AI...'} />
                  </Form.Item>
                </Col>
              )}
              {llmProvider === 'openrouter' && (
                <Col xs={24} lg={12}>
                  <Form.Item label={t('settings.openrouterApiKey')} extra={settings?.has_openrouter_key ? t('settings.apiKeyConfigured') : t('settings.requiredForOpenrouter')}>
                    <Input.Password value={openrouterKey} onChange={event => setOpenrouterKey(event.target.value)} placeholder={settings?.has_openrouter_key ? '••••••••••••••••' : 'sk-or-...'} />
                  </Form.Item>
                </Col>
              )}
              {llmProvider === 'together' && (
                <Col xs={24} lg={12}>
                  <Form.Item label={t('settings.togetherApiKey')} extra={settings?.has_together_key ? t('settings.apiKeyConfigured') : t('settings.requiredForTogether')}>
                    <Input.Password value={togetherKey} onChange={event => setTogetherKey(event.target.value)} placeholder={settings?.has_together_key ? '••••••••••••••••' : '...'} />
                  </Form.Item>
                </Col>
              )}
              {llmProvider === 'fireworks' && (
                <Col xs={24} lg={12}>
                  <Form.Item label={t('settings.fireworksApiKey')} extra={settings?.has_fireworks_key ? t('settings.apiKeyConfigured') : t('settings.requiredForFireworks')}>
                    <Input.Password value={fireworksKey} onChange={event => setFireworksKey(event.target.value)} placeholder={settings?.has_fireworks_key ? '••••••••••••••••' : '...'} />
                  </Form.Item>
                </Col>
              )}
              {llmProvider === 'ollama' && (
                <Col xs={24} lg={12}>
                  <Form.Item label={t('settings.ollamaBaseUrl')} extra={t('settings.ollamaHelper')}>
                    <Input value={ollamaUrl} onChange={event => setOllamaUrl(event.target.value)} placeholder="http://localhost:11434" />
                  </Form.Item>
                </Col>
              )}
              {llmProvider === 'lmstudio' && (
                <Col xs={24} lg={12}>
                  <Form.Item label={t('settings.lmstudioBaseUrl')} extra={t('settings.lmstudioHelper')}>
                    <Input value={lmstudioUrl} onChange={event => setLmstudioUrl(event.target.value)} placeholder="http://localhost:1234" />
                  </Form.Item>
                </Col>
              )}
              <Col xs={24} lg={12}>
                <Form.Item label={t('settings.maxOutputTokens')} extra={t('settings.maxOutputTokensHelper')}>
                  <InputNumber min={1024} max={64000} value={maxOutputTokens} onChange={setMaxOutputTokens} style={{ width: '100%' }} placeholder={t('settings.defaultProfileBased')} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </ProCard>

        <ProCard bordered title={<Space><RocketOutlined />{t('settings.advancedFeatures')}</Space>} subTitle={t('settings.advancedFeaturesDesc')}>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={8}>
              <ProCard bordered size="small" title={<Space><BranchesOutlined />{t('settings.modelRouting')}</Space>} extra={<Switch checked={enableModelRouting} onChange={setEnableModelRouting} />}>
                <Text type="secondary">{t('settings.modelRoutingDesc')}</Text>
              </ProCard>
            </Col>
            <Col xs={24} lg={8}>
              <ProCard bordered size="small" title={<Space><InfoCircleOutlined />{t('settings.knowledgeAugmentation')}</Space>} extra={<Switch checked={enableKnowledgeAugmentation} onChange={setEnableKnowledgeAugmentation} />}>
                <Text type="secondary">{t('settings.knowledgeAugmentationDesc')}</Text>
              </ProCard>
            </Col>
            <Col xs={24} lg={8}>
              <ProCard bordered size="small" title={<Space><EyeOutlined />{t('settings.browserValidation')}</Space>} extra={<Switch checked={enableBrowserValidation} onChange={setEnableBrowserValidation} />}>
                <Text type="secondary">{t('settings.browserValidationDesc')}</Text>
              </ProCard>
            </Col>
          </Row>
        </ProCard>

        <ProCard bordered title={<Space><BellOutlined />{t('settings.notifications')}</Space>} subTitle={t('settings.notificationsDesc')} extra={<Switch checked={enableNotifications} onChange={setEnableNotifications} />}>
          {enableNotifications && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Form layout="vertical">
                <Form.Item label={t('settings.severityFilter')} extra={t('settings.severityFilterHelper')}>
                  <Input value={notificationSeverityFilter} onChange={event => setNotificationSeverityFilter(event.target.value)} placeholder="critical,high" />
                </Form.Item>
              </Form>

              <ProCard bordered size="small" title={<Space><MessageOutlined />Discord{settings?.has_discord_webhook && <Tag color="green">{t('settings.configured')}</Tag>}</Space>} extra={<Button size="small" loading={testingChannel === 'discord'} disabled={!settings?.has_discord_webhook} onClick={() => handleTestNotification('discord')}>{t('settings.test')}</Button>}>
                <Form layout="vertical">
                  <Form.Item label={t('settings.webhookUrl')} extra={settings?.has_discord_webhook ? t('settings.webhookConfigured') : t('settings.discordHelper')}>
                    <Input.Password value={discordWebhookUrl} onChange={event => setDiscordWebhookUrl(event.target.value)} placeholder={settings?.has_discord_webhook ? '••••••••••••••••' : 'https://discord.com/api/webhooks/...'} />
                  </Form.Item>
                </Form>
              </ProCard>

              <ProCard bordered size="small" title={<Space><SendOutlined />Telegram{settings?.has_telegram_bot && <Tag color="green">{t('settings.configured')}</Tag>}</Space>} extra={<Button size="small" loading={testingChannel === 'telegram'} disabled={!settings?.has_telegram_bot} onClick={() => handleTestNotification('telegram')}>{t('settings.test')}</Button>}>
                <Row gutter={16}>
                  <Col xs={24} lg={12}>
                    <Form.Item label={t('settings.botToken')} extra={t('settings.telegramBotHelper')}>
                      <Input.Password value={telegramBotToken} onChange={event => setTelegramBotToken(event.target.value)} placeholder={settings?.has_telegram_bot ? '••••••••••••••••' : '123456:ABC-DEF...'} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Form.Item label={t('settings.chatId')} extra={t('settings.telegramChatIdHelper')}>
                      <Input value={telegramChatId} onChange={event => setTelegramChatId(event.target.value)} placeholder="-1001234567890" />
                    </Form.Item>
                  </Col>
                </Row>
              </ProCard>

              <ProCard bordered size="small" title={<Space><PhoneOutlined />{t('settings.whatsappTwilio')}{settings?.has_twilio_credentials && <Tag color="green">{t('settings.configured')}</Tag>}</Space>} extra={<Button size="small" loading={testingChannel === 'whatsapp'} disabled={!settings?.has_twilio_credentials} onClick={() => handleTestNotification('whatsapp')}>{t('settings.test')}</Button>}>
                <Row gutter={16}>
                  <Col xs={24} lg={12}><Form.Item label={t('settings.accountSid')}><Input.Password value={twilioAccountSid} onChange={event => setTwilioAccountSid(event.target.value)} placeholder={settings?.has_twilio_credentials ? '••••••••' : 'AC...'} /></Form.Item></Col>
                  <Col xs={24} lg={12}><Form.Item label={t('settings.authToken')}><Input.Password value={twilioAuthToken} onChange={event => setTwilioAuthToken(event.target.value)} placeholder={settings?.has_twilio_credentials ? '••••••••' : '...'} /></Form.Item></Col>
                  <Col xs={24} lg={12}><Form.Item label={t('settings.fromNumber')}><Input value={twilioFromNumber} onChange={event => setTwilioFromNumber(event.target.value)} placeholder="+14155238886" /></Form.Item></Col>
                  <Col xs={24} lg={12}><Form.Item label={t('settings.toNumber')}><Input value={twilioToNumber} onChange={event => setTwilioToNumber(event.target.value)} placeholder="+1234567890" /></Form.Item></Col>
                </Row>
                <Text type="secondary">{t('settings.twilioHelper')}</Text>
              </ProCard>
            </Space>
          )}
        </ProCard>

        <ProCard bordered title={<Space><SecurityScanOutlined />{t('settings.scanSettings')}</Space>} subTitle={t('settings.scanSettingsDesc')}>
          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item label={t('settings.maxConcurrentScans')} extra={t('settings.maxConcurrentScansHelper')}>
                <InputNumber min={1} max={10} value={maxConcurrentScans} onChange={value => setMaxConcurrentScans(value || 1)} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <ProCard bordered size="small" title={<Space><ThunderboltOutlined />{t('settings.enableAggressiveMode')}</Space>} extra={<Switch checked={aggressiveMode} onChange={setAggressiveMode} />}>
                <Text type="secondary">{t('settings.aggressiveModeDesc')}</Text>
              </ProCard>
            </Col>
          </Row>
        </ProCard>

        <ProCard bordered title={<Space><DatabaseOutlined />{t('settings.databaseManagement')}</Space>} subTitle={t('settings.databaseManagementDesc')} extra={<Button icon={<ReloadOutlined spin={statsRefreshing} />} onClick={handleRefreshStats}>{t('settings.refreshStatistics')}</Button>}>
          {dbStats && (
            <StatisticCard.Group direction="row">
              <StatisticCard statistic={{ title: t('settings.scans'), value: formatNumber(dbStats.scans) }} />
              <StatisticCard statistic={{ title: t('settings.vulnerabilities'), value: formatNumber(dbStats.vulnerabilities) }} />
              <StatisticCard statistic={{ title: t('settings.endpoints'), value: formatNumber(dbStats.endpoints) }} />
              <StatisticCard statistic={{ title: t('settings.reports'), value: formatNumber(dbStats.reports) }} />
            </StatisticCard.Group>
          )}
          <Divider />
          <Space direction="vertical" style={{ width: '100%' }}>
            {totalDbRecords > 0 && <Text type="secondary">{totalDbRecords.toLocaleString()} {t('settings.totalRecordsStored')}</Text>}
            <ProCard bordered size="small" title={t('settings.clearAllData')} subTitle={t('settings.clearAllDataDesc')}>
              <Popconfirm
                title={t('settings.areYouSure')}
                description={t('settings.clearConfirmDesc')}
                okText={t('settings.yesClearEverything')}
                cancelText={t('settings.cancel')}
                okButtonProps={{ danger: true, loading: isClearing }}
                onConfirm={handleClearDatabase}
              >
                <Button danger icon={<DeleteOutlined />} loading={isClearing}>{t('settings.clearDatabase')}</Button>
              </Popconfirm>
            </ProCard>
          </Space>
        </ProCard>

        <ProCard bordered title={<Space><SettingOutlined />{t('settings.aboutBctechai')}</Space>}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space>
              <SecurityScanOutlined style={{ fontSize: 32, color: '#1677ff' }} />
              <Space direction="vertical" size={0}>
                <Text strong style={{ fontSize: 18 }}>PTTechAI v3.0</Text>
                <Text type="secondary">{t('settings.aiPoweredPlatform')}</Text>
              </Space>
            </Space>
            <Row gutter={[12, 12]}>
              {[
                t('settings.feature1'),
                t('settings.feature2'),
                t('settings.feature3'),
                t('settings.feature4'),
                t('settings.feature5'),
                t('settings.feature6'),
                t('settings.feature7'),
                t('settings.feature8'),
              ].map(feature => (
                <Col key={feature} xs={24} md={12}>
                  <Space><CheckCircleOutlined style={{ color: '#52c41a' }} /><Text type="secondary">{feature}</Text></Space>
                </Col>
              ))}
            </Row>
          </Space>
        </ProCard>

        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button type="primary" size="large" icon={<SaveOutlined />} loading={isSaving} onClick={handleSave}>{t('settings.saveSettings')}</Button>
        </Space>
      </Space>
    </PageContainer>
  )
}
