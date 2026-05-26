import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import api from '../../services/api'

const { Text } = Typography

interface APIKey {
  id: string
  name: string
  key_hash: string
  created_at: string
  last_used: string | null
  expires_at: string | null
}

interface CreateKeyFormValues {
  name: string
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : '-'
}

export default function APIKeysPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const [keys, setKeys] = useState<APIKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [showNewKey, setShowNewKey] = useState<string | null>(null)
  const [form] = Form.useForm<CreateKeyFormValues>()

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api-keys')
      setKeys(res.data)
    } catch (error) {
      console.error('Failed to fetch API keys:', error)
      notification.error({ message: t('apiKeys.createFailed') })
    } finally {
      setLoading(false)
    }
  }, [notification, t])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const handleCreate = async () => {
    const values = await form.validateFields()
    setCreating(true)
    try {
      const res = await api.post('/api-keys', { name: values.name.trim() })
      setShowNewKey(res.data.key)
      setCreateOpen(false)
      form.resetFields()
      notification.success({ message: t('apiKeys.createKey') })
      await fetchKeys()
    } catch {
      notification.error({ message: t('apiKeys.createFailed') })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (keyId: string) => {
    try {
      await api.delete(`/api-keys/${keyId}`)
      setKeys(prev => prev.filter(key => key.id !== keyId))
      notification.success({ message: t('common.delete') })
    } catch {
      notification.error({ message: t('apiKeys.deleteFailed') })
    }
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    notification.success({ message: t('apiKeys.copiedToClipboard') })
  }

  const activeKeys = keys.filter(key => !key.expires_at || new Date(key.expires_at).getTime() > Date.now()).length
  const usedKeys = keys.filter(key => key.last_used).length

  const columns: ProColumns<APIKey>[] = [
    {
      title: t('apiKeys.name'),
      dataIndex: 'name',
      render: (_, key) => (
        <Space direction="vertical" size={2}>
          <Text strong>{key.name}</Text>
          <Text type="secondary">ID: {key.id}</Text>
        </Space>
      ),
    },
    {
      title: t('apiKeys.keyHash'),
      dataIndex: 'key_hash',
      render: (_, key) => <Text code>{key.key_hash.slice(0, 16)}...</Text>,
    },
    {
      title: t('apiKeys.createdAt'),
      dataIndex: 'created_at',
      width: 190,
      render: (_, key) => formatDate(key.created_at),
    },
    {
      title: t('apiKeys.lastUsed'),
      dataIndex: 'last_used',
      width: 190,
      render: (_, key) => key.last_used ? formatDate(key.last_used) : <Text type="secondary">{t('apiKeys.neverUsed')}</Text>,
    },
    {
      title: t('apiKeys.actions'),
      valueType: 'option',
      width: 90,
      render: (_, key) => [
        <Popconfirm
          key="delete"
          title={t('apiKeys.deleteConfirm')}
          okText={t('common.delete')}
          cancelText={t('common.cancel')}
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDelete(key.id)}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>,
      ],
    },
  ]

  if (loading && keys.length === 0) {
    return (
      <PageContainer title={t('apiKeys.title')} subTitle={t('apiKeys.subtitle')}>
        <ProCard bordered><Spin style={{ display: 'block', margin: '64px auto' }} /></ProCard>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={t('apiKeys.title')}
      subTitle={t('apiKeys.subtitle')}
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t('apiKeys.createKey')}</Button>}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: t('apiKeys.myKeys'), value: keys.length, icon: <KeyOutlined /> }} />
          <StatisticCard statistic={{ title: t('common.enabled'), value: activeKeys, icon: <SafetyCertificateOutlined /> }} />
          <StatisticCard statistic={{ title: t('apiKeys.lastUsed'), value: usedKeys, icon: <ClockCircleOutlined /> }} />
        </StatisticCard.Group>

        {showNewKey && (
          <Alert
            type="warning"
            showIcon
            message={t('apiKeys.saveYourKey')}
            description={
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Text>{t('apiKeys.keyOnlyShownOnce')}</Text>
                <Space.Compact style={{ width: '100%' }}>
                  <Input value={showNewKey} readOnly />
                  <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(showNewKey)} />
                </Space.Compact>
              </Space>
            }
            closable
            onClose={() => setShowNewKey(null)}
          />
        )}

        <ProCard bordered title={<Space><ApiOutlined />{t('apiKeys.myKeys')} ({keys.length})</Space>}>
          {keys.length === 0 ? (
            <Empty description={t('apiKeys.noKeys')}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t('apiKeys.createKey')}</Button>
            </Empty>
          ) : (
            <ProTable<APIKey>
              rowKey="id"
              search={false}
              options={false}
              columns={columns}
              dataSource={keys}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              toolBarRender={false}
              loading={loading}
            />
          )}
        </ProCard>
      </Space>

      <Modal
        title={t('apiKeys.createNewKey')}
        open={createOpen}
        confirmLoading={creating}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('apiKeys.keyName')} rules={[{ required: true, message: t('apiKeys.keyName') }]}>
            <Input prefix={<KeyOutlined />} placeholder={t('apiKeys.keyName')} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
