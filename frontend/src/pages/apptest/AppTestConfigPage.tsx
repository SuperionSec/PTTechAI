import { useEffect, useState } from 'react'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import { Form, Input, Button, message, Space, Alert, Badge, Descriptions } from 'antd'
import { SaveOutlined, ApiOutlined, ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { apptestApi } from '../../services/api'

interface ConfigData {
  base_url: string
  client_id: string
  client_secret: string
  username: string
  password: string
  connected: boolean
}

export default function AppTestConfigPage() {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [config, setConfig] = useState<ConfigData | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const resp = await apptestApi.getConfig()
      setConfig(resp.data)
      form.setFieldsValue({
        base_url: resp.data.base_url,
        client_id: resp.data.client_id,
        username: resp.data.username,
        // secret/password come back masked; leave blank so user only fills when changing
        client_secret: '',
        password: '',
      })
    } catch (err: any) {
      message.error(err.response?.data?.detail || t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Build payload: only send fields the user actually filled (avoid overwriting
  // secrets with blanks; backend treats null/empty as "keep current").
  const buildPayload = () => {
    const v = form.getFieldsValue()
    const payload: Record<string, string> = {}
    if (v.base_url) payload.base_url = v.base_url
    if (v.client_id) payload.client_id = v.client_id
    if (v.client_secret) payload.client_secret = v.client_secret
    if (v.username) payload.username = v.username
    if (v.password) payload.password = v.password
    return payload
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const resp = await apptestApi.testConnection(buildPayload())
      if (resp.data.connected) {
        message.success(resp.data.message || t('apptest.testSuccess'))
      } else {
        message.error(`${t('apptest.testFailed')}: ${resp.data.message}`)
      }
    } catch (err: any) {
      message.error(err.response?.data?.detail || t('apptest.testFailed'))
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    await form.validateFields()
    setSaving(true)
    try {
      const resp = await apptestApi.updateConfig(buildPayload())
      setConfig(resp.data)
      message.success(t('apptest.configSaved'))
      load()
    } catch (err: any) {
      message.error(err.response?.data?.detail || t('apptest.configSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageContainer
      title={t('apptest.platformConfig')}
      subTitle={t('apptest.platformConfigSubtitle')}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={load} loading={loading}>
          {t('common.refresh')}
        </Button>,
      ]}
    >
      {/* Connection status banner */}
      <Alert
        style={{ marginBottom: 16 }}
        type={config?.connected ? 'success' : 'warning'}
        showIcon
        message={
          config?.connected
            ? <Space><Badge status="success" />{t('apptest.connStatusOk')}</Space>
            : <Space><Badge status="error" />{t('apptest.connStatusFail')}</Space>
        }
        description={config?.connected ? t('apptest.connStatusOkDesc') : t('apptest.connStatusFailDesc')}
      />

      <ProCard
        title={<Space><ApiOutlined />{t('apptest.platformConfig')}</Space>}
        loading={loading}
      >
        <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
          <Form.Item
            name="base_url"
            label={t('apptest.cfgBaseUrl')}
            rules={[{ required: true, message: t('apptest.cfgBaseUrlRequired') }]}
            extra={t('apptest.cfgBaseUrlHint')}
          >
            <Input placeholder="https://rundet.ijiami.cn" />
          </Form.Item>

          <Form.Item
            name="username"
            label={t('apptest.cfgUsername')}
            rules={[{ required: true, message: t('apptest.cfgUsernameRequired') }]}
          >
            <Input placeholder={t('apptest.cfgUsernamePlaceholder')} autoComplete="off" />
          </Form.Item>

          <Form.Item
            name="password"
            label={t('apptest.cfgPassword')}
            extra={config?.password ? t('apptest.cfgPasswordKeepHint') : undefined}
          >
            <Input.Password placeholder={config?.password ? `${t('apptest.cfgCurrentMasked')}: ${config.password}` : t('apptest.cfgPasswordPlaceholder')} autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="client_id"
            label={t('apptest.cfgClientId')}
            extra={t('apptest.cfgClientIdHint')}
          >
            <Input placeholder="client" autoComplete="off" />
          </Form.Item>

          <Form.Item
            name="client_secret"
            label={t('apptest.cfgClientSecret')}
            extra={config?.client_secret ? t('apptest.cfgClientSecretKeepHint') : undefined}
          >
            <Input.Password placeholder={config?.client_secret ? `${t('apptest.cfgCurrentMasked')}: ${config.client_secret}` : 'client'} autoComplete="new-password" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button icon={<CheckCircleOutlined />} onClick={handleTest} loading={testing}>
                {t('apptest.testConnection')}
              </Button>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                {t('apptest.saveConfig')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </ProCard>

      {/* Current effective config (masked) */}
      {config && (
        <ProCard title={t('apptest.currentConfig')} style={{ marginTop: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item label={t('apptest.cfgBaseUrl')}>{config.base_url || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('apptest.cfgUsername')}>{config.username || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('apptest.cfgClientId')}>{config.client_id || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('apptest.cfgClientSecret')}>{config.client_secret || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('apptest.cfgPassword')}>{config.password || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('apptest.connStatus')}>
              {config.connected
                ? <Badge status="success" text={t('apptest.connStatusOk')} />
                : <Badge status="error" text={t('apptest.connStatusFail')} />}
            </Descriptions.Item>
          </Descriptions>
        </ProCard>
      )}
    </PageContainer>
  )
}
