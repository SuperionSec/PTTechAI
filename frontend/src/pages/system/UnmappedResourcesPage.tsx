import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  CheckCircleOutlined,
  GlobalOutlined,
  LinkOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useAuth } from '../../contexts/AuthContext'
import { rbacApi } from '../../services/system'
import type { Permission, UnmappedResource } from '../../services/system'

const { Text } = Typography

export default function UnmappedResourcesPage() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const { notification } = AntApp.useApp()

  const [unmappedResources, setUnmappedResources] = useState<UnmappedResource[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [mappingTarget, setMappingTarget] = useState<UnmappedResource | null>(null)
  const [selectedPermission, setSelectedPermission] = useState<string>('')

  const notify = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    notification[type]({ message })
  }

  const fetchUnmappedResources = async () => {
    try {
      setLoading(true)
      const data = await rbacApi.unmappedResources()
      setUnmappedResources(data)
    } catch (error) {
      console.error('Failed to fetch unmapped resources:', error)
      notify(t('unmappedResources.fetchFailed', 'Failed to fetch unmapped resources'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchPermissions = async () => {
    try {
      const data = await rbacApi.permissions()
      setPermissions(data)
    } catch (error) {
      console.error('Failed to fetch permissions:', error)
    }
  }

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      navigate('/')
      return
    }
    fetchUnmappedResources()
    fetchPermissions()
  }, [currentUser, navigate])

  const getRecommendedPermission = (resourcePath: string, resourceType: string): string => {
    if (resourceType === 'frontend_page') {
      if (resourcePath.includes('scan')) return permissions.find(permission => permission.name === 'scan:read')?.id || ''
      if (resourcePath.includes('report')) return permissions.find(permission => permission.name === 'report:read')?.id || ''
      if (resourcePath.includes('user') || resourcePath.includes('role')) return permissions.find(permission => permission.name === 'user:manage')?.id || ''
      if (resourcePath.includes('settings')) return permissions.find(permission => permission.name === 'settings:read')?.id || ''
      if (resourcePath.includes('agent')) return permissions.find(permission => permission.name === 'agent:read')?.id || ''
      if (resourcePath.includes('scheduler')) return permissions.find(permission => permission.name === 'scheduler:read')?.id || ''
      if (resourcePath.includes('knowledge')) return permissions.find(permission => permission.name === 'knowledge:read')?.id || ''
      if (resourcePath === '/') return permissions.find(permission => permission.name === 'dashboard:read')?.id || ''
    } else {
      const parts = resourcePath.split(' ')
      if (parts.length >= 2) {
        const path = parts[1]
        if (path.includes('scan')) return permissions.find(permission => permission.name === 'scan:read')?.id || ''
        if (path.includes('report')) return permissions.find(permission => permission.name === 'report:read')?.id || ''
        if (path.includes('user')) return permissions.find(permission => permission.name === 'user:read')?.id || ''
        if (path.includes('settings')) return permissions.find(permission => permission.name === 'settings:read')?.id || ''
      }
    }
    return ''
  }

  const openMappingModal = (resource: UnmappedResource) => {
    setMappingTarget(resource)
    setSelectedPermission(getRecommendedPermission(resource.resource_path, resource.resource_type))
  }

  const handleCreateMapping = async () => {
    if (!mappingTarget || !selectedPermission) return

    setActionLoading(mappingTarget.resource_path)
    try {
      await rbacApi.createResourceMapping({
        permission_id: selectedPermission,
        resource_type: mappingTarget.resource_type,
        resource_path: mappingTarget.resource_path,
      })
      notify(`Mapped ${mappingTarget.resource_path} to permission`, 'success')
      setMappingTarget(null)
      setSelectedPermission('')
      await fetchUnmappedResources()
    } catch (error: any) {
      console.error('Failed to create mapping:', error)
      notify(error.response?.data?.detail || 'Failed to create mapping', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const frontendResources = useMemo(() => unmappedResources.filter(resource => resource.resource_type === 'frontend_page'), [unmappedResources])
  const backendResources = useMemo(() => unmappedResources.filter(resource => resource.resource_type === 'backend_api'), [unmappedResources])

  const columns: ProColumns<UnmappedResource>[] = [
    {
      title: t('unmappedResources.resourceType', 'Type'),
      dataIndex: 'resource_type',
      width: 150,
      filters: [
        { text: 'Frontend Page', value: 'frontend_page' },
        { text: 'Backend API', value: 'backend_api' },
      ],
      onFilter: (value, record) => record.resource_type === value,
      render: (_, resource) => resource.resource_type === 'frontend_page'
        ? <Tag color="blue" icon={<GlobalOutlined />}>Frontend</Tag>
        : <Tag color="green" icon={<ApiOutlined />}>API</Tag>,
    },
    {
      title: t('unmappedResources.resourcePath', 'Resource'),
      dataIndex: 'resource_path',
      render: (_, resource) => <Text code>{resource.resource_path}</Text>,
    },
    {
      title: t('unmappedResources.reason', 'Reason'),
      dataIndex: 'reason',
      render: (_, resource) => <Text type="secondary">{resource.reason}</Text>,
    },
    {
      title: t('common.actions', 'Actions'),
      valueType: 'option',
      width: 160,
      render: (_, resource) => [
        <Button key="map" size="small" type="primary" icon={<LinkOutlined />} onClick={() => openMappingModal(resource)}>
          Map
        </Button>,
      ],
    },
  ]

  if (loading) {
    return (
      <PageContainer title={t('unmappedResources.title') || 'Unmapped Resources'}>
        <ProCard bordered><Spin style={{ display: 'block', margin: '64px auto' }} /></ProCard>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={t('unmappedResources.title') || 'Unmapped Resources'}
      subTitle={t('unmappedResources.subtitle') || 'Resources not bound to any permission. Map them to ensure proper access control.'}
      onBack={() => navigate('/roles')}
      extra={<Button icon={<ReloadOutlined />} onClick={fetchUnmappedResources}>{t('common.refresh')}</Button>}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {unmappedResources.length === 0 ? (
          <ProCard bordered>
            <Empty
              image={<CheckCircleOutlined style={{ fontSize: 56, color: '#52c41a' }} />}
              description={(
                <Space direction="vertical">
                  <Text strong>All Resources Mapped</Text>
                  <Text type="secondary">All frontend pages and backend APIs are properly bound to permissions.</Text>
                </Space>
              )}
            />
          </ProCard>
        ) : (
          <>
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message={t('unmappedResources.warning', 'Unmapped resources are currently governed by the server-side fallback policy.')}
            />
            <StatisticCard.Group direction="row">
              <StatisticCard statistic={{ title: 'Frontend Pages', value: frontendResources.length, icon: <GlobalOutlined /> }} />
              <StatisticCard statistic={{ title: 'Backend APIs', value: backendResources.length, icon: <ApiOutlined /> }} />
              <StatisticCard statistic={{ title: 'Total Unmapped', value: unmappedResources.length, icon: <WarningOutlined />, status: 'warning' }} />
            </StatisticCard.Group>
            <ProCard bordered>
              <ProTable<UnmappedResource>
                rowKey={record => `${record.resource_type}:${record.resource_path}`}
                search={false}
                options={false}
                columns={columns}
                dataSource={unmappedResources}
                pagination={{ pageSize: 10, showSizeChanger: true }}
                toolBarRender={false}
              />
            </ProCard>
          </>
        )}
      </Space>

      <Modal
        title="Map Permission"
        open={Boolean(mappingTarget)}
        confirmLoading={Boolean(actionLoading)}
        onOk={handleCreateMapping}
        onCancel={() => {
          setMappingTarget(null)
          setSelectedPermission('')
        }}
        okText="Map"
        okButtonProps={{ disabled: !selectedPermission }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {mappingTarget && (
            <Alert
              type="info"
              showIcon
              message={<Text code>{mappingTarget.resource_path}</Text>}
              description={mappingTarget.reason}
            />
          )}
          <Select
            showSearch
            value={selectedPermission || undefined}
            placeholder="Select permission..."
            onChange={setSelectedPermission}
            style={{ width: '100%' }}
            optionFilterProp="label"
            options={permissions.map(permission => ({
              value: permission.id,
              label: `${permission.name} (${permission.scope}:${permission.action})`,
            }))}
          />
        </Space>
      </Modal>
    </PageContainer>
  )
}
