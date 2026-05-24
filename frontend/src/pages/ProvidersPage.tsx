import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Avatar,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  List,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  CheckCircleOutlined,
  CloudSyncOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,

  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { TFunction } from 'i18next'
import { relativeTime } from '../utils/time'
import { providersApi } from '../services/api'

const { Text } = Typography

interface Account {
  id: string
  label: string
  source: string
  credential_type: string
  is_active: boolean
  tokens_used: number
  last_used: string | null
  expires_at: number | null
  model_override: string | null
}

interface Provider {
  id: string
  name: string
  auth_type: string
  api_format: string
  tier: number
  default_model: string
  accounts: Account[]
  connected: boolean
  enabled: boolean
  is_default?: boolean
}

interface ProviderStatus {
  enabled: boolean
  total_requests: number
  total_tokens: number
}

interface ConnectFormValues {
  label?: string
  credential: string
}

const providerColors: Record<string, string> = {
  claude_code: '#f97316',
  codex_cli: '#22c55e',
  gemini_cli: '#60a5fa',
  cursor: '#a855f7',
  copilot: '#6b7280',
  iflow: '#22d3ee',
  qwen_code: '#6366f1',
  kiro: '#eab308',
  bailian: '#dc2626',
  anthropic: '#ea580c',
  openai: '#059669',
  gemini: '#3b82f6',
  openrouter: '#8b5cf6',
  glm: '#ef4444',
  kimi: '#ec4899',
  minimax: '#f59e0b',
  together: '#14b8a6',
  fireworks: '#f43f5e',
  ollama: '#4b5563',
  lmstudio: '#64748b',
}

const providerInitials: Record<string, string> = {
  claude_code: 'CC',
  codex_cli: 'CX',
  gemini_cli: 'GC',
  cursor: 'CU',
  copilot: 'CP',
  iflow: 'iF',
  qwen_code: 'QC',
  kiro: 'KI',
  bailian: 'BL',
  anthropic: 'AN',
  openai: 'OA',
  gemini: 'GM',
  openrouter: 'OR',
  glm: 'GL',
  kimi: 'KM',
  minimax: 'MM',
  together: 'TG',
  fireworks: 'FW',
  ollama: 'OL',
  lmstudio: 'LS',
}

const tierLabels: Record<number, string> = {
  1: 'tier1',
  2: 'tier2',
  3: 'tier3',
}

function formatExpiryTime(expiresAt: number | null, t: TFunction): { label: string; color?: string } {
  if (!expiresAt) return { label: '' }
  const diff = expiresAt - Date.now() / 1000
  if (diff <= 0) return { label: t('providers.expired'), color: 'red' }
  const minutes = Math.floor(diff / 60)
  if (minutes < 60) return { label: t('providers.minutesLeft', { minutes }), color: 'gold' }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { label: t('providers.hoursLeft', { hours }), color: hours < 2 ? 'gold' : 'green' }
  const days = Math.floor(hours / 24)
  return { label: t('providers.daysLeft', { days }), color: 'green' }
}

function providerInitial(provider: Provider) {
  return providerInitials[provider.id] || provider.id.substring(0, 2).toUpperCase()
}

function providerColor(provider: Provider) {
  return providerColors[provider.id] || '#64748b'
}

export default function ProvidersPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const [providers, setProviders] = useState<Provider[]>([])
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [status, setStatus] = useState<ProviderStatus | null>(null)
  const [showEnvEditor, setShowEnvEditor] = useState(false)
  const [envVars, setEnvVars] = useState<Record<string, string>>({})
  const [envAllowedKeys, setEnvAllowedKeys] = useState<string[]>([])
  const [envEditing, setEnvEditing] = useState<Record<string, string>>({})
  const [envSaving, setEnvSaving] = useState<string | null>(null)
  const [envSearch, setEnvSearch] = useState('')

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    notification[type]({ message })
  }, [notification])

  const fetchProviders = useCallback(async () => {
    try {
      const data = await providersApi.list()
      setEnabled(data.enabled)
      setProviders(data.providers || [])
    } catch (error) {
      console.error('Failed to fetch providers:', error)
      setEnabled(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const data = await providersApi.getStatus()
      setStatus(data)
    } catch {
      setStatus(null)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchProviders(), fetchStatus()])
    setRefreshing(false)
  }, [fetchProviders, fetchStatus])

  useEffect(() => {
    fetchProviders()
    fetchStatus()
  }, [fetchProviders, fetchStatus])

  const oauthProviders = useMemo(() => providers.filter(provider => provider.auth_type === 'oauth'), [providers])
  const apiKeyProviders = useMemo(() => providers.filter(provider => provider.auth_type === 'api_key'), [providers])
  const connectedCount = useMemo(() => providers.filter(provider => provider.connected).length, [providers])
  const totalTokensUsed = useMemo(() => providers.reduce((sum, provider) => sum + provider.accounts.reduce((accountSum, account) => accountSum + account.tokens_used, 0), 0), [providers])
  const totalAccounts = useMemo(() => providers.reduce((sum, provider) => sum + provider.accounts.length, 0), [providers])
  const filteredEnvKeys = useMemo(() => {
    if (!envSearch.trim()) return envAllowedKeys
    const q = envSearch.toLowerCase()
    return envAllowedKeys.filter(key => key.toLowerCase().includes(q))
  }, [envAllowedKeys, envSearch])

  const handleDetectAll = useCallback(async () => {
    setDetecting(true)
    try {
      const data = await providersApi.detectAll()
      if (data.detected_count > 0) {
        await fetchProviders()
        notify(t('providers.detectedTokens', { count: data.detected_count }), 'success')
      } else {
        notify(t('providers.noNewTokens'), 'info')
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      notify(`${t('providers.detectionFailed')}: ${msg}`, 'error')
    } finally {
      setDetecting(false)
    }
  }, [fetchProviders, notify, t])

  const handleToggleProvider = useCallback(async (providerId: string, currentEnabled: boolean) => {
    try {
      await providersApi.toggle(providerId, !currentEnabled)
      setProviders(prev => prev.map(provider => provider.id === providerId ? { ...provider, enabled: !currentEnabled } : provider))
      notify(t(`providers.${!currentEnabled ? 'enabled' : 'disabled'}`), 'success')
    } catch {
      notify(t('providers.failedToToggle'), 'error')
    }
  }, [notify, t])

  const fetchEnvVars = useCallback(async () => {
    try {
      const data = await providersApi.getEnv()
      setEnvVars(data.env || {})
      setEnvAllowedKeys(data.allowed_keys || [])
      setEnvEditing({ ...(data.env || {}) })
    } catch {
      notify(t('providers.loadEnvFailed'), 'error')
    }
  }, [notify, t])

  const handleSaveEnvVar = useCallback(async (key: string) => {
    setEnvSaving(key)
    try {
      await providersApi.updateEnv(key, envEditing[key] || '')
      setEnvVars(prev => ({ ...prev, [key]: envEditing[key] || '' }))
      notify(`Saved ${key}`, 'success')
    } catch {
      notify(`Failed to save ${key}`, 'error')
    } finally {
      setEnvSaving(null)
    }
  }, [envEditing, notify])

  const handleEnvEditorToggle = useCallback(() => {
    setShowEnvEditor(prev => {
      if (!prev) fetchEnvVars()
      return !prev
    })
  }, [fetchEnvVars])

  if (loading) {
    return (
      <PageContainer title={t('providers.title')}>
        <ProCard bordered><Spin style={{ display: 'block', margin: '64px auto' }} tip={t('providers.loadingProviders')} /></ProCard>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={t('providers.title')}
      subTitle={enabled ? t('providers.smartRouterActive', { connected: connectedCount, total: providers.length }) : t('providers.smartRouterDisabled')}
      extra={[
        <Button key="detect" type="primary" icon={<SearchOutlined />} loading={detecting} onClick={handleDetectAll}>
          {t('providers.detectAllClis')}
        </Button>,
        <Button key="refresh" icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh}>
          {t('common.refresh')}
        </Button>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {!enabled && (
          <Alert
            type="warning"
            showIcon
            message={t('providers.smartRouterDisabledTitle')}
            description={t('providers.smartRouterDisabledDesc')}
          />
        )}

        {providers.length > 0 && (
          <StatisticCard.Group direction="row">
            <StatisticCard statistic={{ title: t('providers.providersCount'), value: providers.length, icon: <ApiOutlined /> }} />
            <StatisticCard statistic={{ title: t('providers.connected'), value: connectedCount, icon: <CheckCircleOutlined />, status: 'success' }} />
            <StatisticCard statistic={{ title: t('providers.accountsCount'), value: totalAccounts, icon: <KeyOutlined /> }} />
            <StatisticCard statistic={{ title: t('providers.totalTokensCount'), value: totalTokensUsed, icon: <ThunderboltOutlined /> }} />
            {status?.enabled && <StatisticCard statistic={{ title: t('providers.requests'), value: status.total_requests || 0, icon: <CloudSyncOutlined /> }} />}
          </StatisticCard.Group>
        )}

        {oauthProviders.length > 0 && (
          <ProviderSection
            title={t('providers.oauthProviders')}
            subtitle={t('providers.cliTokenDetection')}
            icon={<CloudSyncOutlined />}
            providers={oauthProviders}
            enabled={enabled}
            onSelect={setSelectedProvider}
            onToggle={handleToggleProvider}
            t={t}
          />
        )}

        {apiKeyProviders.length > 0 && (
          <ProviderSection
            title={t('providers.apiKeyProviders')}
            icon={<KeyOutlined />}
            providers={apiKeyProviders}
            enabled={enabled}
            onSelect={setSelectedProvider}
            onToggle={handleToggleProvider}
            t={t}
          />
        )}

        {providers.length === 0 && (
          <ProCard bordered>
            <Empty
              image={<ApiOutlined style={{ fontSize: 56 }} />}
              description={(
                <Space direction="vertical">
                  <Text strong>{t('providers.noProviders')}</Text>
                  <Text type="secondary">{t('providers.addFirstProvider')}</Text>
                </Space>
              )}
            />
          </ProCard>
        )}

        <ProCard
          bordered
          title={<Space><SettingOutlined />{t('providers.apiKeyConfigManager')}</Space>}
          extra={<Button type="link" onClick={handleEnvEditorToggle}>{showEnvEditor ? t('providers.hide') : t('providers.show')}</Button>}
        >
          {showEnvEditor && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder={t('providers.filterVariables')}
                value={envSearch}
                onChange={event => setEnvSearch(event.target.value)}
                style={{ maxWidth: 360 }}
              />
              {envAllowedKeys.length === 0 ? (
                <Spin tip={t('providers.loading')} />
              ) : filteredEnvKeys.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('providers.noVariablesMatch', { search: envSearch })} />
              ) : (
                <List
                  dataSource={filteredEnvKeys}
                  renderItem={key => {
                    const isModified = envEditing[key] !== envVars[key]
                    return (
                      <List.Item
                        actions={[
                          <Button key="save" size="small" type={isModified ? 'primary' : 'default'} disabled={!isModified} loading={envSaving === key} onClick={() => handleSaveEnvVar(key)}>
                            {t('providers.save')}
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={<Text code>{key}</Text>}
                          description={(
                            <Input.Password
                              value={envEditing[key] || ''}
                              placeholder={t('providers.notSet')}
                              onChange={event => setEnvEditing(prev => ({ ...prev, [key]: event.target.value }))}
                            />
                          )}
                        />
                      </List.Item>
                    )
                  }}
                />
              )}
            </Space>
          )}
        </ProCard>
      </Space>

      {selectedProvider && (
        <ConfigDrawer
          provider={selectedProvider}
          enabled={enabled}
          open={Boolean(selectedProvider)}
          onClose={() => {
            setSelectedProvider(null)
            fetchProviders()
          }}
          notify={notify}
          t={t}
        />
      )}
    </PageContainer>
  )
}

function ProviderSection({
  title,
  subtitle,
  icon,
  providers,
  enabled,
  onSelect,
  onToggle,
  t,
}: {
  title: string
  subtitle?: string
  icon: React.ReactNode
  providers: Provider[]
  enabled: boolean
  onSelect: (provider: Provider) => void
  onToggle: (providerId: string, enabled: boolean) => void
  t: TFunction
}) {
  return (
    <ProCard title={<Space>{icon}{title}</Space>} subTitle={subtitle} bordered>
      <ProCard gutter={16} wrap ghost>
        {providers.map(provider => {
          const activeAccounts = provider.accounts.filter(account => account.is_active).length
          const totalTokens = provider.accounts.reduce((sum, account) => sum + account.tokens_used, 0)
          const isProviderEnabled = provider.enabled !== false
          return (
            <ProCard key={provider.id} colSpan={{ xs: 24, sm: 12, md: 8, xl: 6 }} bordered hoverable>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space onClick={() => enabled && onSelect(provider)} style={{ cursor: enabled ? 'pointer' : 'default' }}>
                    <Avatar style={{ backgroundColor: providerColor(provider) }}>{providerInitial(provider)}</Avatar>
                    <Space direction="vertical" size={0}>
                      <Space wrap>
                        <Text strong>{provider.name}</Text>
                        {provider.is_default && <Tag color="blue">{t('providers.default')}</Tag>}
                        {provider.connected && isProviderEnabled && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                      </Space>
                      <Text type="secondary" code>{provider.default_model}</Text>
                    </Space>
                  </Space>
                  <Switch
                    size="small"
                    checked={isProviderEnabled}
                    checkedChildren={t('common.on')}
                    unCheckedChildren={t('common.off')}
                    onChange={() => onToggle(provider.id, isProviderEnabled)}
                  />
                </Space>
                <Space wrap>
                  <Tag color={provider.auth_type === 'oauth' ? 'cyan' : 'gold'}>{provider.auth_type}</Tag>
                  <Tag>{t(`common.${tierLabels[provider.tier]}`)}</Tag>
                  <Tag color={activeAccounts > 0 && isProviderEnabled ? 'green' : undefined}>{activeAccounts}/{provider.accounts.length} {t('providers.active')}</Tag>
                  {totalTokens > 0 && <Tag icon={<ThunderboltOutlined />}>{totalTokens.toLocaleString()}</Tag>}
                </Space>
                <Button block disabled={!enabled} onClick={() => onSelect(provider)}>{t('providers.configure', 'Configure')}</Button>
              </Space>
            </ProCard>
          )
        })}
      </ProCard>
    </ProCard>
  )
}

function ConfigDrawer({
  provider,
  enabled,
  open,
  onClose,
  notify,
  t,
}: {
  provider: Provider
  enabled: boolean
  open: boolean
  onClose: () => void
  notify: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  t: TFunction
}) {
  const [accounts, setAccounts] = useState<Account[]>(provider.accounts)
  const [detecting, setDetecting] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [form] = Form.useForm<ConnectFormValues>()

  const activeAccounts = useMemo(() => accounts.filter(account => account.is_active).length, [accounts])

  const handleDetect = useCallback(async () => {
    setDetecting(true)
    setTestResult(null)
    try {
      const data = await providersApi.detect(provider.id)
      if (data.detected) {
        setAccounts(prev => [
          ...prev,
          {
            id: data.account_id,
            label: data.label,
            source: 'cli_detect',
            credential_type: data.credential_type,
            is_active: true,
            tokens_used: 0,
            last_used: null,
            expires_at: data.expires_at,
            model_override: null,
          },
        ])
        setTestResult({ success: true, message: t('providers.detected', { label: data.label }) })
        notify(t('providers.detected', { label: data.label }), 'success')
      } else {
        setTestResult({ success: false, message: data.message || t('providers.noTokenFound') })
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('providers.unknownError')
      setTestResult({ success: false, message: msg })
    } finally {
      setDetecting(false)
    }
  }, [provider.id, notify, t])

  const handleConnect = useCallback(async () => {
    const values = await form.validateFields()
    setAdding(true)
    setTestResult(null)
    try {
      const data = await providersApi.connect(provider.id, values.credential, values.label || t('providers.apiKey'))
      if (data.success) {
        setAccounts(prev => [
          ...prev,
          {
            id: data.account_id,
            label: values.label || t('providers.apiKey'),
            source: 'manual',
            credential_type: 'api_key',
            is_active: true,
            tokens_used: 0,
            last_used: null,
            expires_at: null,
            model_override: null,
          },
        ])
        form.resetFields()
        setTestResult({ success: true, message: t('providers.connectedSuccessfully') })
        notify(t('providers.accountConnected'), 'success')
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('providers.unknownError')
      setTestResult({ success: false, message: msg })
    } finally {
      setAdding(false)
    }
  }, [form, provider.id, notify, t])

  const handleTest = useCallback(async (accountId: string) => {
    setTesting(accountId)
    setTestResult(null)
    try {
      const data = await providersApi.testConnection(provider.id, accountId)
      setTestResult({ success: data.success, message: data.message })
      if (data.success) notify(t('providers.connectionTestPassed'), 'success')
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('providers.unknownError')
      setTestResult({ success: false, message: msg })
    } finally {
      setTesting(null)
    }
  }, [provider.id, notify, t])

  const handleRemove = useCallback(async (accountId: string) => {
    try {
      await providersApi.removeAccount(provider.id, accountId)
      setAccounts(prev => prev.filter(account => account.id !== accountId))
      setTestResult({ success: true, message: t('providers.accountRemoved') })
      notify(t('providers.accountRemoved'), 'success')
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('providers.unknownError')
      setTestResult({ success: false, message: msg })
    }
  }, [provider.id, notify, t])

  return (
    <Drawer
      title={(
        <Space>
          <Avatar style={{ backgroundColor: providerColor(provider) }}>{providerInitial(provider)}</Avatar>
          <Space direction="vertical" size={0}>
            <Text strong>{provider.name}</Text>
            <Text type="secondary">{provider.api_format} / {provider.default_model}</Text>
          </Space>
        </Space>
      )}
      open={open}
      onClose={onClose}
      width={620}
      extra={<Tag color="green">{activeAccounts}/{accounts.length} {t('providers.active')}</Tag>}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {provider.auth_type === 'oauth' && (
          <Button type="primary" block icon={<SearchOutlined />} loading={detecting} disabled={!enabled} onClick={handleDetect}>
            {t('providers.detectCliToken')}
          </Button>
        )}

        <ProCard title={t('providers.addCredential')} bordered>
          <Form form={form} layout="vertical">
            <Form.Item name="label" label={t('providers.labelOptional')}>
              <Input />
            </Form.Item>
            <Form.Item name="credential" label={provider.auth_type === 'oauth' ? t('providers.oauthToken') : t('providers.apiKey')} rules={[{ required: true }]}>
              <Input.Password />
            </Form.Item>
            <Button type="primary" icon={<PlusOutlined />} loading={adding} disabled={!enabled} onClick={handleConnect}>
              {t('common.add')}
            </Button>
          </Form>
        </ProCard>

        {testResult && (
          <Alert type={testResult.success ? 'success' : 'error'} showIcon message={testResult.message} />
        )}

        <ProCard title={`${t('providers.accounts')} (${accounts.length})`} bordered>
          {accounts.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={provider.auth_type === 'oauth' ? t('providers.detectOrAdd') : t('providers.addApiKey')}
            />
          ) : (
            <List
              dataSource={accounts}
              renderItem={account => {
                const expiry = formatExpiryTime(account.expires_at, t)
                return (
                  <List.Item
                    actions={[
                      <Button key="test" size="small" icon={<ExperimentOutlined />} loading={testing === account.id} disabled={!enabled} onClick={() => handleTest(account.id)}>
                        {t('providers.testConnection')}
                      </Button>,
                      <Popconfirm key="remove" title={t('providers.removeAccount')} onConfirm={() => handleRemove(account.id)} okButtonProps={{ danger: true }}>
                        <Button size="small" danger icon={<DeleteOutlined />} disabled={!enabled} />
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      title={(
                        <Space wrap>
                          <Text strong>{account.label}</Text>
                          <Tag color={account.source === 'cli_detect' ? 'blue' : account.source === 'env_var' ? 'green' : undefined}>
                            {account.source === 'cli_detect' ? t('providers.cli') : account.source === 'env_var' ? t('providers.env') : t('providers.manual')}
                          </Tag>
                          {!account.is_active && <Tag color="red">{t('providers.inactive')}</Tag>}
                        </Space>
                      )}
                      description={(
                        <Space wrap>
                          <Tag icon={<ThunderboltOutlined />}>{account.tokens_used.toLocaleString()} {t('providers.tokens')}</Tag>
                          {account.last_used && <Tag>{relativeTime(account.last_used, t)}</Tag>}
                          {expiry.label && <Tag color={expiry.color}>{expiry.label}</Tag>}
                        </Space>
                      )}
                    />
                  </List.Item>
                )
              }}
            />
          )}
        </ProCard>
      </Space>
    </Drawer>
  )
}
