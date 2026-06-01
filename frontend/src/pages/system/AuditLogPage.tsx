import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer } from '@ant-design/pro-components'
import { Button, Card, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { auditApi } from '../../services/system'
import type { AuditLog } from '../../services/system'

const { Text } = Typography

export default function AuditLogPage() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<string | undefined>()
  const [resourceType, setResourceType] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await auditApi.list({
        action,
        resource_type: resourceType,
        page,
        per_page: pageSize,
      })
      setLogs(data.logs)
      setTotal(data.total)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to fetch audit logs')
    } finally {
      setLoading(false)
    }
  }, [action, resourceType, page, pageSize])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const columns: ColumnsType<AuditLog> = [
    {
      title: t('audit.time', 'Time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 190,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: t('audit.user', 'User'),
      dataIndex: 'username',
      key: 'username',
      width: 180,
      render: (value: string | null) => value || <Text type="secondary">-</Text>,
    },
    {
      title: t('audit.action', 'Action'),
      dataIndex: 'action',
      key: 'action',
      width: 170,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: t('audit.resource', 'Resource'),
      key: 'resource',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{record.resource_type || '-'}</Text>
          {record.resource_id && <Text type="secondary" code>{record.resource_id}</Text>}
        </Space>
      ),
    },
    {
      title: t('audit.ip', 'IP'),
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 140,
      render: (value: string | null) => value || <Text type="secondary">-</Text>,
    },
    {
      title: t('audit.details', 'Details'),
      dataIndex: 'details',
      key: 'details',
      render: (value: Record<string, unknown> | null) =>
        value ? <Text code>{JSON.stringify(value)}</Text> : <Text type="secondary">-</Text>,
    },
  ]

  return (
    <PageContainer
      title={t('audit.title', 'Audit Logs')}
      subTitle={t('audit.subtitle', 'Track system management operations')}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={fetchLogs}>
          {t('common.refresh', 'Refresh')}
        </Button>,
      ]}
    >
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            allowClear
            placeholder={t('audit.filterAction', 'Filter action')}
            style={{ width: 220 }}
            value={action}
            onChange={(value) => { setAction(value); setPage(1) }}
            options={[
              'auth.login_success',
              'auth.login_failed',
              'menu.create',
              'menu.update',
              'menu.delete',
            ].map(value => ({ label: value, value }))}
          />
          <Select
            allowClear
            placeholder={t('audit.filterResource', 'Filter resource')}
            style={{ width: 180 }}
            value={resourceType}
            onChange={(value) => { setResourceType(value); setPage(1) }}
            options={['auth', 'menu', 'user', 'role', 'api_key', 'profile'].map(value => ({ label: value, value }))}
          />
          <Button icon={<SearchOutlined />} onClick={fetchLogs}>
            {t('common.search', 'Search')}
          </Button>
        </Space>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
        />
      </Card>
    </PageContainer>
  )
}
