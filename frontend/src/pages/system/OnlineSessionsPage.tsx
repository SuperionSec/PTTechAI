import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import { App as AntApp, Button, Popconfirm, Space, Tag, Typography } from 'antd'
import { LogoutOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons'
import { sessionApi, organizationApi } from '../../services/system'
import type { OnlineSession } from '../../services/system'
import { useAccess } from '../../hooks/useAccess'

const { Text } = Typography

export default function OnlineSessionsPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const access = useAccess()
  const isPlatformAdmin = access.canTenantManage
  const actionRef = useRef<ActionType>()
  const [total, setTotal] = useState(0)
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({})

  useEffect(() => {
    // Platform admin: load tenant names to label sessions by tenant.
    if (!isPlatformAdmin) return
    organizationApi.tenants()
      .then(d => setTenantMap(Object.fromEntries(d.tenants.map((x: any) => [x.id, x.name]))))
      .catch(() => {})
  }, [isPlatformAdmin])

  const fetchSessions = useCallback(async () => {
    try {
      const data = await sessionApi.list()
      setTotal(data.total)
      return data.sessions
    } catch (err: any) {
      notification.error({ message: err?.response?.data?.detail || t('sessionManagement.fetchFailed', 'Failed to fetch sessions') })
      return []
    }
  }, [notification, t])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const handleForceLogout = async (jti: string) => {
    try {
      await sessionApi.forceLogout(jti)
      notification.success({ message: t('sessionManagement.logoutSuccess', 'Session terminated') })
      actionRef.current?.reload()
    } catch (err: any) {
      notification.error({ message: err?.response?.data?.detail || t('sessionManagement.logoutFailed', 'Failed to terminate session') })
    }
  }

  const columns: ProColumns<OnlineSession>[] = [
    {
      title: t('sessionManagement.user', 'User'),
      dataIndex: 'username',
      render: (_, s) => (
        <Space direction="vertical" size={0}>
          <Text strong>{s.full_name || s.username}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{s.username}</Text>
        </Space>
      ),
    },
    { title: t('sessionManagement.ip', 'IP'), dataIndex: 'ip_address', width: 140, render: (v) => v || <Text type="secondary">-</Text> },
    {
      title: t('usersManagement.tenant', 'Tenant'),
      dataIndex: 'tenant_id',
      width: 150,
      hideInTable: !isPlatformAdmin,
      render: (_, s) => s.tenant_id
        ? <Text>{tenantMap[s.tenant_id] || String(s.tenant_id).slice(0, 8)}</Text>
        : <Tag color="blue">{t('usersManagement.platformUser', 'Platform')}</Tag>,
    },
    { title: t('sessionManagement.device', 'Device'), dataIndex: 'device_info', ellipsis: true, render: (v) => v || <Text type="secondary">-</Text> },
    { title: t('sessionManagement.loginMethod', 'Login'), dataIndex: 'login_method', width: 110, render: (v) => <Tag>{v || 'password'}</Tag> },
    { title: t('sessionManagement.loginTime', 'Login Time'), dataIndex: 'created_at', width: 180, render: (v) => v ? new Date(v as string).toLocaleString() : '-' },
    { title: t('sessionManagement.lastActive', 'Last Active'), dataIndex: 'last_used_at', width: 180, render: (v) => v ? new Date(v as string).toLocaleString() : '-' },
    {
      title: t('common.actions', 'Actions'),
      width: 120,
      render: (_, s) => (
        <Popconfirm
          title={t('sessionManagement.forceLogoutTitle', 'Force logout')}
          description={t('sessionManagement.forceLogoutConfirm', 'This will immediately sign the user out.')}
          okText={t('sessionManagement.forceLogout', 'Force logout')}
          cancelText={t('common.cancel', 'Cancel')}
          okButtonProps={{ danger: true }}
          onConfirm={() => handleForceLogout(s.jti)}
        >
          <Button size="small" danger icon={<LogoutOutlined />}>{t('sessionManagement.forceLogout', 'Force logout')}</Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <PageContainer
      title={t('sessionManagement.title', 'Online Sessions')}
      subTitle={t('sessionManagement.subtitle', 'Active user sessions; force-logout if needed')}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: t('sessionManagement.online', 'Online Sessions'), value: total, icon: <TeamOutlined /> }} />
        </StatisticCard.Group>
        <ProCard bordered extra={<Button icon={<ReloadOutlined />} onClick={() => actionRef.current?.reload()}>{t('common.refresh', 'Refresh')}</Button>}>
          <ProTable<OnlineSession>
            actionRef={actionRef}
            rowKey="jti"
            search={false}
            options={false}
            columns={columns}
            request={async () => {
              const data = await fetchSessions()
              return { data, success: true, total: data.length }
            }}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            toolBarRender={false}
          />
        </ProCard>
      </Space>
    </PageContainer>
  )
}
