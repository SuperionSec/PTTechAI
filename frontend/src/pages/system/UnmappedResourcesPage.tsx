import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
import { systemApi } from '../../services/system'
import type { Permission, UnmappedResource } from '../../services/system'

const { Text } = Typography

function UnmappedResourceStatisticCards({ frontendCount, backendCount, totalCount, t }: {
  frontendCount: number
  backendCount: number
  totalCount: number
  t: TFunction
}) {
  return (
    <StatisticCard.Group direction="row">
      <StatisticCard statistic={{ title: t('accessCoverage.frontendPages', 'Frontend Pages'), value: frontendCount, icon: <GlobalOutlined /> }} />
      <StatisticCard statistic={{ title: t('accessCoverage.backendApis', 'Backend APIs'), value: backendCount, icon: <ApiOutlined /> }} />
      <StatisticCard statistic={{ title: t('accessCoverage.uncoveredResources', 'Resources Needing Rules'), value: totalCount, icon: <WarningOutlined />, status: totalCount ? 'warning' : 'success' }} />
    </StatisticCard.Group>
  )
}

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
      const data = await systemApi.unmappedResources()
      setUnmappedResources(data)
    } catch (error) {
      console.error('Failed to fetch unmapped resources:', error)
      notify(t('accessCoverage.fetchFailed', 'Failed to fetch access coverage resources'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchPermissions = async () => {
    try {
      const data = await systemApi.permissions()
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
      await systemApi.createResourceMapping({
        permission_id: selectedPermission,
        resource_type: mappingTarget.resource_type,
        resource_path: mappingTarget.resource_path,
      })
      notify(t('accessCoverage.mappingCreated', 'Permission mapping created'), 'success')
      setMappingTarget(null)
      setSelectedPermission('')
      await fetchUnmappedResources()
    } catch (error: any) {
      console.error('Failed to create mapping:', error)
      notify(error.response?.data?.detail || t('accessCoverage.mappingFailed', 'Failed to create permission mapping'), 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const frontendResources = useMemo(() => unmappedResources.filter(resource => resource.resource_type === 'frontend_page'), [unmappedResources])
  const backendResources = useMemo(() => unmappedResources.filter(resource => resource.resource_type === 'backend_api'), [unmappedResources])

  const columns: ProColumns<UnmappedResource>[] = [
    {
      title: t('accessCoverage.resourceType', 'Type'),
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
      title: t('accessCoverage.resourcePath', 'Resource'),
      dataIndex: 'resource_path',
      render: (_, resource) => <Text code>{resource.resource_path}</Text>,
    },
    {
      title: t('accessCoverage.reason', 'Coverage Gap'),
      dataIndex: 'reason',
      render: (_, resource) => <Text type="secondary">{resource.reason}</Text>,
    },
    {
      title: t('common.actions', 'Actions'),
      valueType: 'option',
      width: 160,
      render: (_, resource) => [
        <Button key="map" size="small" type="primary" icon={<LinkOutlined />} onClick={() => openMappingModal(resource)}>
          {t('accessCoverage.mapPermission', 'Bind Permission')}
        </Button>,
      ],
    },
  ]

  if (loading) {
    return (
      <PageContainer title={t('accessCoverage.title', 'Access Coverage')}>
        <ProCard bordered><Spin style={{ display: 'block', margin: '64px auto' }} /></ProCard>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={t('accessCoverage.title', 'Access Coverage')}
      subTitle={t('accessCoverage.subtitle', 'Audit discovered pages and APIs that still need explicit permission rules.')}
      onBack={() => navigate('/roles')}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ProCard bordered>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center" wrap>
            <Space direction="vertical" size={4}>
              <Text strong>{t('accessCoverage.title', 'Access Coverage')}</Text>
              <Text type="secondary">{t('accessCoverage.subtitle', 'Audit discovered pages and APIs that still need explicit permission rules.')}</Text>
            </Space>
            <Button icon={<ReloadOutlined />} onClick={fetchUnmappedResources}>{t('common.refresh')}</Button>
          </Space>
        </ProCard>

        <UnmappedResourceStatisticCards
          frontendCount={frontendResources.length}
          backendCount={backendResources.length}
          totalCount={unmappedResources.length}
          t={t}
        />

        {unmappedResources.length === 0 ? (
          <ProCard bordered>
            <Empty
              image={<CheckCircleOutlined style={{ fontSize: 56, color: '#52c41a' }} />}
              description={(
                <Space direction="vertical">
                  <Text strong>{t('accessCoverage.allCovered', 'All Resources Covered')}</Text>
                  <Text type="secondary">{t('accessCoverage.allCoveredDesc', 'All discovered frontend pages and backend APIs have explicit permission mappings.')}</Text>
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
              message={t('accessCoverage.warning', 'Resources listed here are using the server-side fallback policy until you bind them to explicit permissions.')}
            />
            <ProCard bordered title={<Space><WarningOutlined />{t('accessCoverage.pendingRules', 'Resources Needing Access Rules')} ({unmappedResources.length})</Space>}>
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
        title={t('accessCoverage.mapPermission', 'Bind Permission')}
        open={Boolean(mappingTarget)}
        confirmLoading={Boolean(actionLoading)}
        onOk={handleCreateMapping}
        onCancel={() => {
          setMappingTarget(null)
          setSelectedPermission('')
        }}
        okText={t('accessCoverage.mapPermission', 'Bind Permission')}
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
            placeholder={t('accessCoverage.selectPermission', 'Select permission...')}
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
