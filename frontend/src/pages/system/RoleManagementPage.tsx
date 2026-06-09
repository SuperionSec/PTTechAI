import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { PageContainer, ProCard, ProDescriptions, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  GlobalOutlined,
  LinkOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { systemApi } from '../../services/system'
import type { Permission, ResourceMapping, RoleSummary, UnmappedResource } from '../../services/system'

const { Text } = Typography

interface RoleFormValues {
  role: string
  display_name: string
  description?: string
  is_active: boolean
}

function RoleStatisticCards({ roles, permissions, t }: {
  roles: RoleSummary[]
  permissions: Permission[]
  t: TFunction
}) {
  return (
    <StatisticCard.Group direction="row">
      <StatisticCard statistic={{ title: t('roleManagement.roles'), value: roles.length, icon: <SafetyCertificateOutlined /> }} />
      <StatisticCard statistic={{ title: t('roleManagement.permissions'), value: permissions.length, icon: <LockOutlined /> }} />
      <StatisticCard statistic={{ title: t('roleManagement.activeRoles'), value: roles.filter(role => role.is_active).length, icon: <TeamOutlined /> }} />
    </StatisticCard.Group>
  )
}

function PermissionSelector({
  formError,
  groupedPermissions,
  selectedPermissions,
  togglePermissions,
  t,
}: {
  formError: string | null
  groupedPermissions: Record<string, Permission[]>
  selectedPermissions: Set<string>
  togglePermissions: (permissionIds: string[]) => void
  t: TFunction
}) {
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {formError && <Alert type="error" showIcon message={formError} />}
      <Text type="secondary">{t('roleManagement.permissions')} ({selectedPermissions.size})</Text>
      {Object.keys(groupedPermissions).length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('roleManagement.noPermissions')} />
      ) : (
        <Tree
          checkable
          defaultExpandAll
          checkedKeys={Array.from(selectedPermissions)}
          onCheck={checkedKeys => togglePermissions(Array.isArray(checkedKeys) ? checkedKeys.map(String) : checkedKeys.checked.map(String))}
          treeData={Object.entries(groupedPermissions).map(([scope, scopePermissions]) => ({
            title: `${scope} (${scopePermissions.length})`,
            key: `scope:${scope}`,
            selectable: false,
            children: scopePermissions.map(permission => ({
              title: (
                <Space direction="vertical" size={0}>
                  <Text strong>{permission.name}</Text>
                  {permission.description && <Text type="secondary">{permission.description}</Text>}
                </Space>
              ),
              key: permission.id,
            })),
          }))}
        />
      )}
    </Space>
  )
}

export default function RoleManagementPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const actionRef = useRef<ActionType>()

  const [roles, setRoles] = useState<RoleSummary[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editRole, setEditRole] = useState<string | null>(null)
  const [viewRole, setViewRole] = useState<string | null>(null)
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())
  const [viewRolePermissions, setViewRolePermissions] = useState<Permission[]>([])
  const [viewResourceMappings, setViewResourceMappings] = useState<ResourceMapping[]>([])
  const [viewLoading, setViewLoading] = useState(false)
  const [viewRoleActive, setViewRoleActive] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form] = Form.useForm<RoleFormValues>()

  // Unmapped resources state
  const [unmappedOpen, setUnmappedOpen] = useState(false)
  const [unmappedResources, setUnmappedResources] = useState<UnmappedResource[]>([])
  const [unmappedLoading, setUnmappedLoading] = useState(false)
  const [mappingTarget, setMappingTarget] = useState<UnmappedResource | null>(null)
  const [selectedPermission, setSelectedPermission] = useState<string>('')
  const [mappingLoading, setMappingLoading] = useState(false)

  const defaultRoleLabels: Record<string, string> = useMemo(() => ({
    admin: t('roleManagement.admin'),
    user: t('roleManagement.user'),
    viewer: t('roleManagement.viewer'),
    service: t('roleManagement.service'),
  }), [t])

  const roleLabels: Record<string, string> = useMemo(() => {
    const labels = { ...defaultRoleLabels }
    for (const r of roles) {
      if (!labels[r.role] && r.display_name) {
        labels[r.role] = r.display_name
      }
    }
    return labels
  }, [defaultRoleLabels, roles])

  const defaultRoleColors: Record<string, string> = {
    admin: 'red',
    user: 'blue',
    viewer: 'default',
    service: 'purple',
  }
  const roleColors = useMemo(() => {
    const palette = ['green', 'orange', 'cyan', 'magenta', 'gold', 'lime', 'geekblue', 'volcano']
    const colors = { ...defaultRoleColors }
    let idx = 0
    for (const r of roles) {
      if (!colors[r.role]) {
        colors[r.role] = palette[idx % palette.length]
        idx++
      }
    }
    return colors
  }, [roles])

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    notification[type]({ message })
  }, [notification])

  const fetchRoles = useCallback(async () => {
    try {
      const data = await systemApi.roles()
      setRoles(data)
      return data
    } catch (error) {
      console.error('Failed to fetch roles:', error)
      notify(t('roleManagement.fetchFailed') || 'Failed to fetch roles', 'error')
      return []
    }
  }, [notify, t])

  const fetchPermissions = useCallback(async () => {
    try {
      const data = await systemApi.permissions()
      setPermissions(data)
    } catch (error) {
      console.error('Failed to fetch permissions:', error)
    }
  }, [])

  // Unmapped resources functions
  const fetchUnmappedResources = useCallback(async () => {
    setUnmappedLoading(true)
    try {
      const data = await systemApi.unmappedResources()
      setUnmappedResources(data)
    } catch (error) {
      console.error('Failed to fetch unmapped resources:', error)
      notify(t('accessCoverage.fetchFailed', 'Failed to fetch access coverage resources'), 'error')
    } finally {
      setUnmappedLoading(false)
    }
  }, [notify, t])

  const openUnmappedModal = () => {
    setUnmappedOpen(true)
    fetchUnmappedResources()
  }

  const getRecommendedPermission = useCallback((resourcePath: string, resourceType: string): string => {
    if (resourceType === 'frontend_page') {
      if (resourcePath.includes('scan')) return permissions.find(p => p.name === 'scan:read')?.id || ''
      if (resourcePath.includes('report')) return permissions.find(p => p.name === 'report:read')?.id || ''
      if (resourcePath.includes('user') || resourcePath.includes('role')) return permissions.find(p => p.name === 'user:manage')?.id || ''
      if (resourcePath.includes('settings')) return permissions.find(p => p.name === 'settings:read')?.id || ''
      if (resourcePath.includes('agent')) return permissions.find(p => p.name === 'agent:read')?.id || ''
      if (resourcePath.includes('scheduler')) return permissions.find(p => p.name === 'scheduler:read')?.id || ''
      if (resourcePath.includes('knowledge')) return permissions.find(p => p.name === 'knowledge:read')?.id || ''
      if (resourcePath === '/') return permissions.find(p => p.name === 'dashboard:read')?.id || ''
    } else {
      const parts = resourcePath.split(' ')
      if (parts.length >= 2) {
        const path = parts[1]
        if (path.includes('scan')) return permissions.find(p => p.name === 'scan:read')?.id || ''
        if (path.includes('report')) return permissions.find(p => p.name === 'report:read')?.id || ''
        if (path.includes('user')) return permissions.find(p => p.name === 'user:read')?.id || ''
        if (path.includes('settings')) return permissions.find(p => p.name === 'settings:read')?.id || ''
      }
    }
    return ''
  }, [permissions])

  const openMappingModal = (resource: UnmappedResource) => {
    setMappingTarget(resource)
    setSelectedPermission(getRecommendedPermission(resource.resource_path, resource.resource_type))
  }

  const handleCreateMapping = async () => {
    if (!mappingTarget || !selectedPermission) return
    setMappingLoading(true)
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
      notify(error.response?.data?.detail || t('accessCoverage.mappingFailed', 'Failed to create permission mapping'), 'error')
    } finally {
      setMappingLoading(false)
    }
  }

  useEffect(() => {
    fetchPermissions()
    setLoading(false)
  }, [fetchPermissions])

  const resetForm = () => {
    form.resetFields()
    setSelectedPermissions(new Set())
    setFormError(null)
    setEditRole(null)
  }

  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
      const scope = permission.scope || permission.name.split(':')[0] || 'other'
      groups[scope] = groups[scope] || []
      groups[scope].push(permission)
      return groups
    }, {})
  }, [permissions])

  const togglePermissions = (permissionIds: string[]) => {
    setSelectedPermissions(new Set(permissionIds.filter(permissionId => !permissionId.startsWith('scope:'))))
  }

  const openCreateModal = () => {
    resetForm()
    form.setFieldsValue({ is_active: true })
    setCreateOpen(true)
  }

  const openEditModal = async (role: string) => {
    setEditRole(role)
    setFormError(null)
    setActionLoading(true)
    try {
      const data = await systemApi.role(role)
      form.setFieldsValue({
        role: data.role,
        display_name: data.display_name || data.role,
        description: data.description || '',
        is_active: data.is_active,
      })
      setSelectedPermissions(new Set(data.permissions.map(permission => permission.id) || []))
    } catch (error) {
      console.error('Failed to fetch role permissions:', error)
      notify(t('roleManagement.fetchRoleFailed') || 'Failed to fetch role permissions', 'error')
      setEditRole(null)
    } finally {
      setActionLoading(false)
    }
  }

  const openViewModal = async (role: string) => {
    setViewRole(role)
    setViewLoading(true)
    try {
      const [data, allMappings] = await Promise.all([
        systemApi.role(role),
        systemApi.resourceMappings(),
      ])
      setViewRolePermissions(data.permissions || [])
      setViewRoleActive(data.is_active ?? false)
      const rolePermissionIds = new Set(data.permissions.map(permission => permission.id))
      setViewResourceMappings(allMappings.filter(mapping => rolePermissionIds.has(mapping.permission_id)))
    } catch (error) {
      console.error('Failed to fetch role permissions:', error)
      setViewRolePermissions([])
      setViewResourceMappings([])
    } finally {
      setViewLoading(false)
    }
  }

  const openCloneModal = async (role: string) => {
    setActionLoading(true)
    try {
      const data = await systemApi.role(role)
      resetForm()
      form.setFieldsValue({
        role: `${role}_copy`,
        display_name: `${data.display_name || role} (Copy)`,
        description: data.description || '',
        is_active: true,
      })
      setSelectedPermissions(new Set(data.permissions.map(p => p.id)))
      setCreateOpen(true)
    } catch (error) {
      console.error('Failed to clone role:', error)
      notify(t('roleManagement.fetchRoleFailed') || 'Failed to fetch role for cloning', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateRole = async () => {
    const values = await form.validateFields()
    if (!/^[a-z0-9_]{1,50}$/.test(values.role)) {
      setFormError(t('roleManagement.roleNameInvalid') || 'Only lowercase letters, numbers and underscore allowed (max 50 chars)')
      return
    }

    setActionLoading(true)
    setFormError(null)
    try {
      await systemApi.createRole({
        name: values.role,
        display_name: values.display_name,
        description: values.description,
        is_active: values.is_active,
        permission_ids: Array.from(selectedPermissions),
      })
      setCreateOpen(false)
      resetForm()
      actionRef.current?.reload()
      notify(t('roleManagement.createSuccess') || 'Role created successfully', 'success')
    } catch (error: any) {
      setFormError(error.response?.data?.detail || (t('roleManagement.createFailed') || 'Failed to create role'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleEditRole = async () => {
    if (!editRole) return
    const values = await form.validateFields()
    setActionLoading(true)
    setFormError(null)
    try {
      await systemApi.updateRole(editRole, {
        display_name: values.display_name,
        description: values.description,
        is_active: values.is_active,
        permission_ids: Array.from(selectedPermissions),
      })
      setEditRole(null)
      resetForm()
      actionRef.current?.reload()
      notify(t('roleManagement.updateSuccess') || 'Role updated successfully', 'success')
    } catch (error: any) {
      setFormError(error.response?.data?.detail || (t('roleManagement.updateFailed') || 'Failed to update role'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteRole = async (role: RoleSummary) => {
    if (role.user_count > 0) return
    setActionLoading(true)
    try {
      await systemApi.deleteRole(role.role)
      actionRef.current?.reload()
      notify(t('roleManagement.deleteSuccess') || 'Role deleted successfully', 'success')
    } catch (error: any) {
      notify(error.response?.data?.detail || (t('roleManagement.deleteFailed') || 'Failed to delete role'), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const roleMetadataForm = (roleNameDisabled: boolean) => (
    <Form form={form} layout="vertical">
      <Form.Item
        name="role"
        label={t('roleManagement.roleName')}
        rules={[{ required: true, message: t('roleManagement.roleNameRequired') || 'Role name is required' }]}
      >
        <Input disabled={roleNameDisabled} placeholder={t('roleManagement.roleNamePlaceholder') || 'e.g. auditor'} />
      </Form.Item>
      <Form.Item
        name="display_name"
        label={t('roleManagement.displayName')}
        rules={[{ required: true, message: t('roleManagement.displayNameRequired') || 'Display name is required' }]}
      >
        <Input />
      </Form.Item>
      <Form.Item name="description" label={t('common.description')}>
        <Input.TextArea rows={3} />
      </Form.Item>
      <Form.Item name="is_active" label={t('common.status')} valuePropName="checked">
        <Switch checkedChildren={t('common.enabled')} unCheckedChildren={t('common.disabled')} />
      </Form.Item>
    </Form>
  )

  const permissionSelector = (
    <PermissionSelector
      formError={formError}
      groupedPermissions={groupedPermissions}
      selectedPermissions={selectedPermissions}
      togglePermissions={togglePermissions}
      t={t}
    />
  )

  const viewFrontendMappings = viewResourceMappings.filter(mapping => mapping.resource_type === 'frontend_page')
  const viewBackendMappings = viewResourceMappings.filter(mapping => mapping.resource_type === 'backend_api')

  const columns: ProColumns<RoleSummary>[] = [
    {
      title: t('roleManagement.roleName'),
      dataIndex: 'role',
      render: (_, role) => (
        <Space>
          <Tag color={roleColors[role.role]}>{roleLabels[role.role] || role.role}</Tag>
        </Space>
      ),
    },
    {
      title: t('roleManagement.userCount'),
      dataIndex: 'user_count',
      width: 160,
      render: (_, role) => <Space><TeamOutlined />{role.user_count}</Space>,
    },
    {
      title: t('roleManagement.permissionCount'),
      dataIndex: 'permission_count',
      width: 180,
      render: (_, role) => <Space><LockOutlined />{role.permission_count}</Space>,
    },
    {
      title: t('roleManagement.actions'),
      valueType: 'option',
      width: 180,
      render: (_, role) => [
        <Tooltip key="view" title={t('roleManagement.view')}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openViewModal(role.role)} />
        </Tooltip>,
        <Tooltip key="edit" title={t('roleManagement.edit')}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(role.role)} />
        </Tooltip>,
        <Tooltip key="clone" title={t('roleManagement.clone', 'Clone')}>
          <Button size="small" icon={<CopyOutlined />} onClick={() => openCloneModal(role.role)} />
        </Tooltip>,
        <Popconfirm
          key="delete"
          title={t('roleManagement.deleteRole')}
          description={role.user_count > 0 ? t('roleManagement.cannotDeleteUsersAssigned', { count: role.user_count }) : t('roleManagement.deleteConfirm', { role: role.role })}
          okText={t('common.delete')}
          cancelText={t('common.cancel')}
          okButtonProps={{ danger: true, disabled: role.user_count > 0 }}
          onConfirm={() => handleDeleteRole(role)}
          disabled={role.user_count > 0}
        >
          <Button size="small" danger disabled={role.user_count > 0} icon={<DeleteOutlined />} />
        </Popconfirm>,
      ],
    },
  ]

  if (loading) {
    return (
      <PageContainer title={t('roleManagement.title')} subTitle={t('roleManagement.subtitle')}>
        <ProCard bordered><Spin style={{ display: 'block', margin: '64px auto' }} /></ProCard>
      </PageContainer>
    )
  }

  return (
    <PageContainer title={t('roleManagement.title')} subTitle={t('roleManagement.subtitle')}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ProCard bordered>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center" wrap>
            <Space direction="vertical" size={4}>
              <Text strong>{t('roleManagement.title')}</Text>
              <Text type="secondary">{t('roleManagement.subtitle')}</Text>
            </Space>
            <Space wrap>
              <Button icon={<WarningOutlined />} onClick={openUnmappedModal}>
                {t('roleManagement.unmappedTab', 'Access Coverage')}
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                {t('roleManagement.createRole')}
              </Button>
            </Space>
          </Space>
        </ProCard>

        <RoleStatisticCards roles={roles} permissions={permissions} t={t} />

        <ProCard bordered title={<Space><SafetyCertificateOutlined />{t('roleManagement.roles')} ({roles.length})</Space>}>
          <ProTable<RoleSummary>
            actionRef={actionRef}
            rowKey="role"
            search={false}
            options={false}
            columns={columns}
            request={async () => {
              const data = await fetchRoles()
              return { data, success: true, total: data.length }
            }}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            toolBarRender={false}
          />
        </ProCard>
      </Space>

      <Modal
        title={t('roleManagement.createRole')}
        open={createOpen}
        width={820}
        confirmLoading={actionLoading}
        onOk={handleCreateRole}
        onCancel={() => {
          setCreateOpen(false)
          resetForm()
        }}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {roleMetadataForm(false)}
          {permissionSelector}
        </Space>
      </Modal>

      <Modal
        title={`${t('roleManagement.editRole')} - ${editRole ?? ''}`}
        open={Boolean(editRole)}
        width={820}
        confirmLoading={actionLoading}
        onOk={handleEditRole}
        onCancel={() => resetForm()}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        {actionLoading && selectedPermissions.size === 0 ? <Spin style={{ display: 'block', margin: '32px auto' }} /> : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {roleMetadataForm(true)}
            {permissionSelector}
          </Space>
        )}
      </Modal>

      <Modal
        title={`${t('roleManagement.rolePermissions')} - ${viewRole ?? ''}`}
        open={Boolean(viewRole)}
        width={840}
        footer={<Button onClick={() => setViewRole(null)}>{t('common.close')}</Button>}
        onCancel={() => setViewRole(null)}
      >
        {viewLoading ? (
          <Spin style={{ display: 'block', margin: '48px auto' }} />
        ) : (
          <Tabs
            items={[
              {
                key: 'details',
                label: t('roleManagement.details', 'Details'),
                children: (
                  <ProDescriptions column={2}>
                    <ProDescriptions.Item label={t('roleManagement.roleName')}>
                      <Tag color={roleColors[viewRole || '']}>{roleLabels[viewRole || ''] || viewRole}</Tag>
                    </ProDescriptions.Item>
                    <ProDescriptions.Item label={t('common.status')}>
                      <Tag color={viewRoleActive ? 'green' : 'default'}>
                        {viewRoleActive ? t('common.enabled') : t('common.disabled')}
                      </Tag>
                    </ProDescriptions.Item>
                    <ProDescriptions.Item label={t('roleManagement.permissions')} span={2}>
                      <StatisticCard.Group direction="row" size="small">
                        <StatisticCard statistic={{ title: t('roleManagement.permissions'), value: viewRolePermissions.length, icon: <LockOutlined /> }} />
                        <StatisticCard statistic={{ title: t('roleManagement.resources'), value: viewResourceMappings.length, icon: <LinkOutlined /> }} />
                      </StatisticCard.Group>
                    </ProDescriptions.Item>
                  </ProDescriptions>
                ),
              },
              {
                key: 'permissions',
                label: `${t('roleManagement.permissions')} (${viewRolePermissions.length})`,
                children: viewRolePermissions.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('roleManagement.noPermissionsAssigned')} />
                ) : (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    {viewRolePermissions.map(permission => (
                      <ProCard key={permission.id} bordered size="small">
                        <Space direction="vertical" size={0}>
                          <Text strong>{permission.name}</Text>
                          {permission.description && <Text type="secondary">{permission.description}</Text>}
                        </Space>
                      </ProCard>
                    ))}
                  </Space>
                ),
              },
              {
                key: 'resources',
                label: `${t('roleManagement.resources')} (${viewResourceMappings.length})`,
                children: viewResourceMappings.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('roleManagement.noResourcesAssigned') || 'No resources assigned'} />
                ) : (
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {viewFrontendMappings.length > 0 && (
                      <ProCard title={<Space><GlobalOutlined />{t('roleManagement.frontendPages') || 'Frontend Pages'}</Space>} bordered>
                        <Space wrap>{viewFrontendMappings.map(mapping => <Tag key={mapping.id} color="blue">{mapping.resource_path}</Tag>)}</Space>
                      </ProCard>
                    )}
                    {viewBackendMappings.length > 0 && (
                      <ProCard title={<Space><ApiOutlined />{t('roleManagement.backendApis') || 'Backend APIs'}</Space>} bordered>
                        <Space direction="vertical" size={4}>{viewBackendMappings.map(mapping => <Text key={mapping.id} code>{mapping.resource_path}</Text>)}</Space>
                      </ProCard>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Modal>

      {/* Unmapped Resources Modal */}
      <Modal
        title={t('accessCoverage.title', 'Access Coverage')}
        open={unmappedOpen}
        width={900}
        footer={<Button onClick={() => setUnmappedOpen(false)}>{t('common.close')}</Button>}
        onCancel={() => setUnmappedOpen(false)}
      >
        {unmappedLoading ? (
          <Spin style={{ display: 'block', margin: '48px auto' }} />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <StatisticCard.Group direction="row">
              <StatisticCard statistic={{ title: t('accessCoverage.frontendPages', 'Frontend Pages'), value: unmappedResources.filter(r => r.resource_type === 'frontend_page').length, icon: <GlobalOutlined /> }} />
              <StatisticCard statistic={{ title: t('accessCoverage.backendApis', 'Backend APIs'), value: unmappedResources.filter(r => r.resource_type === 'backend_api').length, icon: <ApiOutlined /> }} />
              <StatisticCard statistic={{ title: t('accessCoverage.uncoveredResources', 'Pending'), value: unmappedResources.length, icon: <WarningOutlined />, status: unmappedResources.length ? 'warning' : 'success' }} />
            </StatisticCard.Group>

            {unmappedResources.length === 0 ? (
              <Empty
                image={<CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />}
                description={<Text strong>{t('accessCoverage.allCovered', 'All Resources Covered')}</Text>}
              />
            ) : (
              <>
                <Alert type="warning" showIcon icon={<WarningOutlined />} message={t('accessCoverage.warning', 'Resources listed here are using the server-side fallback policy until you bind them to explicit permissions.')} />
                <ProTable<UnmappedResource>
                  rowKey={record => `${record.resource_type}:${record.resource_path}`}
                  search={false}
                  options={false}
                  toolBarRender={() => [
                    <Button key="refresh" icon={<ReloadOutlined />} onClick={fetchUnmappedResources}>{t('common.refresh')}</Button>,
                  ]}
                  columns={[
                    {
                      title: t('accessCoverage.resourceType', 'Type'),
                      dataIndex: 'resource_type',
                      width: 130,
                      filters: [{ text: 'Frontend', value: 'frontend_page' }, { text: 'API', value: 'backend_api' }],
                      onFilter: (value, record) => record.resource_type === value,
                      render: (_, r) => r.resource_type === 'frontend_page'
                        ? <Tag color="blue" icon={<GlobalOutlined />}>Frontend</Tag>
                        : <Tag color="green" icon={<ApiOutlined />}>API</Tag>,
                    },
                    {
                      title: t('accessCoverage.resourcePath', 'Resource'),
                      dataIndex: 'resource_path',
                      render: (_, r) => <Text code>{r.resource_path}</Text>,
                    },
                    {
                      title: t('accessCoverage.reason', 'Gap'),
                      dataIndex: 'reason',
                      render: (_, r) => <Text type="secondary">{r.reason}</Text>,
                    },
                    {
                      title: t('common.actions'),
                      valueType: 'option',
                      width: 140,
                      render: (_, r) => [
                        <Button key="map" size="small" type="primary" icon={<LinkOutlined />} onClick={() => openMappingModal(r)}>
                          {t('accessCoverage.mapPermission', 'Bind')}
                        </Button>,
                      ],
                    },
                  ]}
                  dataSource={unmappedResources}
                  pagination={{ pageSize: 8, showSizeChanger: true }}
                />
              </>
            )}
          </Space>
        )}
      </Modal>

      {/* Bind Permission Modal */}
      <Modal
        title={t('accessCoverage.mapPermission', 'Bind Permission')}
        open={Boolean(mappingTarget)}
        confirmLoading={mappingLoading}
        onOk={handleCreateMapping}
        onCancel={() => { setMappingTarget(null); setSelectedPermission('') }}
        okText={t('accessCoverage.mapPermission', 'Bind Permission')}
        okButtonProps={{ disabled: !selectedPermission }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {mappingTarget && (
            <Alert type="info" showIcon message={<Text code>{mappingTarget.resource_path}</Text>} description={mappingTarget.reason} />
          )}
          <Select
            showSearch
            value={selectedPermission || undefined}
            placeholder={t('accessCoverage.selectPermission', 'Select permission...')}
            onChange={setSelectedPermission}
            style={{ width: '100%' }}
            optionFilterProp="label"
            options={permissions.map(p => ({ value: p.id, label: `${p.name} (${p.scope}:${p.action})` }))}
          />
        </Space>
      </Modal>
    </PageContainer>
  )
}
