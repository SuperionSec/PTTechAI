import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import { App as AntApp, Space, Tag, Typography } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import { auditApi } from '../../services/system'
import type { AuditLog } from '../../services/system'

const { Text } = Typography

const ACTION_OPTIONS = [
  'auth.login_success', 'auth.login_failed', 'auth.logout',
  'menu.create', 'menu.update', 'menu.delete',
  'role.create', 'role.update', 'role.update_permissions', 'role.delete',
  'user.create', 'user.update', 'user.delete',
  'api_key.create', 'api_key.delete',
  'vuln_library.create_entry', 'vuln_library.update_entry', 'vuln_library.delete_entry',
  'vuln_library.create_identifier', 'vuln_library.update_identifier', 'vuln_library.delete_identifier',
  'vuln_library.create_artifact', 'vuln_library.update_artifact', 'vuln_library.delete_artifact',
  'vuln_library.view_exp',
  'vuln_library.create_category', 'vuln_library.update_category', 'vuln_library.delete_category',
  'vuln_library.import_entry',
]

const RESOURCE_TYPE_OPTIONS = [
  'auth', 'menu', 'user', 'role', 'api_key', 'profile',
  'vuln_library_entry', 'vuln_library_identifier', 'vuln_library_artifact', 'vuln_library_category',
]

export default function AuditLogPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const actionRef = useRef<ActionType>()
  const [total, setTotal] = useState(0)

  const columns: ProColumns<AuditLog>[] = [
    {
      title: t('audit.time', 'Time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 190,
      hideInSearch: true,
      render: (_, record) => new Date(record.created_at).toLocaleString(),
    },
    {
      title: t('audit.timeRange', 'Time Range'),
      dataIndex: 'time_range',
      key: 'time_range',
      valueType: 'dateTimeRange',
      hideInTable: true,
      search: { transform: (value: [string, string]) => ({ start_date: value[0], end_date: value[1] }) },
    },
    {
      title: t('audit.user', 'User'),
      dataIndex: 'username',
      key: 'username',
      width: 180,
      hideInSearch: true,
      render: (_, record) => record.username || <Text type="secondary">-</Text>,
    },
    {
      title: t('audit.user', 'User'),
      dataIndex: 'username',
      key: 'username_search',
      hideInTable: true,
      fieldProps: { placeholder: t('audit.userPlaceholder', 'Search by username...') },
    },
    {
      title: t('audit.action', 'Action'),
      dataIndex: 'action',
      key: 'action',
      width: 200,
      valueType: 'select',
      fieldProps: {
        showSearch: true,
        allowClear: true,
        options: ACTION_OPTIONS.map(v => ({ label: v, value: v })),
      },
      render: (_, record) => <Tag color="blue">{record.action}</Tag>,
    },
    {
      title: t('audit.resource', 'Resource'),
      key: 'resource',
      width: 220,
      hideInSearch: true,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{record.resource_type || '-'}</Text>
          {record.resource_id && <Text type="secondary" code>{record.resource_id}</Text>}
        </Space>
      ),
    },
    {
      title: t('audit.resourceType', 'Resource Type'),
      dataIndex: 'resource_type',
      key: 'resource_type',
      hideInTable: true,
      valueType: 'select',
      fieldProps: {
        allowClear: true,
        options: RESOURCE_TYPE_OPTIONS.map(v => ({ label: v, value: v })),
      },
    },
    {
      title: t('audit.ip', 'IP'),
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 140,
      hideInSearch: true,
      render: (_, record) => record.ip_address || <Text type="secondary">-</Text>,
    },
    {
      title: t('audit.details', 'Details'),
      dataIndex: 'details',
      key: 'details',
      hideInSearch: true,
      ellipsis: true,
      render: (_, record) =>
        record.details ? <Text code>{JSON.stringify(record.details)}</Text> : <Text type="secondary">-</Text>,
    },
  ]

  return (
    <PageContainer
      title={t('audit.title', 'Audit Logs')}
      subTitle={t('audit.subtitle', 'Track system management operations')}
    >
      <ProTable<AuditLog>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        search={{
          labelWidth: 'auto',
          defaultCollapsed: false,
        }}
        options={{ density: true, reload: true }}
        pagination={{
          defaultPageSize: 50,
          showSizeChanger: true,
        }}
        request={async (params) => {
          try {
            const data = await auditApi.list({
              action: params.action || undefined,
              resource_type: params.resource_type || undefined,
              username: params.username || undefined,
              start_date: params.start_date || undefined,
              end_date: params.end_date || undefined,
              page: params.current,
              per_page: params.pageSize,
            })
            setTotal(data.total)
            return { data: data.logs, success: true, total: data.total }
          } catch (err: any) {
            notification.error({
              message: err?.response?.data?.detail || t('audit.fetchFailed', 'Failed to fetch audit logs'),
            })
            return { data: [], success: false, total: 0 }
          }
        }}
        toolBarRender={() => [
          <StatisticCard.Group key="stats" direction="row" size="small">
            <StatisticCard
              statistic={{
                title: t('audit.totalLogs', 'Total Logs'),
                value: total,
                icon: <FileTextOutlined />,
              }}
            />
          </StatisticCard.Group>,
        ]}
      />
    </PageContainer>
  )
}
