import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Avatar,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  TreeSelect,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useAuth } from '../../contexts/AuthContext'
import { useAccess } from '../../hooks/useAccess'
import { systemApi, usersApi, organizationApi } from '../../services/system'
import type { RoleSummary, DepartmentNode, Tenant } from '../../services/system'

const { Text } = Typography

/** Convert a DepartmentNode tree into antd TreeSelect treeData. */
function deptToTreeSelect(nodes: DepartmentNode[]): any[] {
  return nodes.map(n => ({
    title: n.name,
    value: n.id,
    children: n.children?.length ? deptToTreeSelect(n.children) : undefined,
  }))
}

interface User {
  id: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string
  last_login: string | null
  tenant_id?: string | null
  department_id?: string | null
  data_scope?: string | null
}

interface CreateUserForm {
  email: string
  password: string
  full_name: string
  role: string
  tenant_id?: string | null
  department_id?: string | null
  data_scope?: string
}

interface ResetPasswordForm {
  new_password: string
}

function UserStatisticCards({ totalUsers, activeUsers, adminUsers, t }: {
  totalUsers: number
  activeUsers: number
  adminUsers: number
  t: (key: string) => string
}) {
  return (
    <StatisticCard.Group direction="row">
      <StatisticCard statistic={{ title: t('usersManagement.userList'), value: totalUsers, icon: <UserOutlined /> }} />
      <StatisticCard statistic={{ title: t('usersManagement.active'), value: activeUsers, icon: <SafetyCertificateOutlined /> }} />
      <StatisticCard statistic={{ title: t('usersManagement.admin'), value: adminUsers, icon: <KeyOutlined /> }} />
    </StatisticCard.Group>
  )
}

export default function UserManagementPage() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const access = useAccess()
  const isPlatformAdmin = access.canTenantManage
  const { notification } = AntApp.useApp()
  const actionRef = useRef<ActionType>()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [resetUser, setResetUser] = useState<User | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showServiceNotice, setShowServiceNotice] = useState(false)
  const [availableRoles, setAvailableRoles] = useState<RoleSummary[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [createTenantId, setCreateTenantId] = useState<string | undefined>(undefined)
  // Department tree (raw) for the create form's TreeSelect.
  const [deptTree, setDeptTree] = useState<DepartmentNode[]>([])
  // Filters (platform admin): by tenant and by role.
  const [filterTenantId, setFilterTenantId] = useState<string | undefined>(undefined)
  const [filterRole, setFilterRole] = useState<string | undefined>(undefined)
  // id -> name maps for showing tenant/department names in the table.
  const [deptNameMap, setDeptNameMap] = useState<Record<string, string>>({})
  const [selectedRows, setSelectedRows] = useState<User[]>([])
  const [batchRoleModalOpen, setBatchRoleModalOpen] = useState(false)
  const [batchRole, setBatchRole] = useState<string>('')
  const [createForm] = Form.useForm<CreateUserForm>()
  const [resetForm] = Form.useForm<ResetPasswordForm>()

  const defaultRoleLabels: Record<string, string> = useMemo(() => ({
    admin: t('usersManagement.admin'),
    user: t('usersManagement.user'),
    viewer: t('usersManagement.viewer'),
    service: t('usersManagement.service'),
  }), [t])

  const roleLabels: Record<string, string> = useMemo(() => {
    const labels = { ...defaultRoleLabels }
    for (const r of availableRoles) {
      if (!labels[r.role] && r.display_name) {
        labels[r.role] = r.display_name
      }
    }
    return labels
  }, [defaultRoleLabels, availableRoles])

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
    for (const r of availableRoles) {
      if (!colors[r.role]) {
        colors[r.role] = palette[idx % palette.length]
        idx++
      }
    }
    return colors
  }, [availableRoles])

  const notify = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    notification[type]({ message })
  }

  const fetchUsers = async (params?: { tenant_id?: string; role?: string }) => {
    try {
      const data = await usersApi.list({ tenant_id: params?.tenant_id, role: params?.role })
      setUsers(data)
      // Build a department id->name map for the visible tenant scope.
      try {
        const treeData = await organizationApi.departmentTree(params?.tenant_id)
        const flat: DepartmentNode[] = []
        const walk = (n: DepartmentNode[]) => { n.forEach(d => { flat.push(d); if (d.children?.length) walk(d.children) }) }
        walk(treeData.departments)
        setDeptNameMap(Object.fromEntries(flat.map(d => [d.id, d.name])))
      } catch { /* ignore */ }
      return data
    } catch (error) {
      console.error('Failed to fetch users:', error)
      notify(t('usersManagement.fetchFailed', 'Failed to fetch users'), 'error')
      return []
    } finally {
      setLoading(false)
    }
  }

  const fetchAvailableRoles = async () => {
    try {
      const data = await systemApi.roles()
      setAvailableRoles(data.filter(role => role.is_active !== false))
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    }
  }

  const fetchTenants = async () => {
    if (!isPlatformAdmin) return
    try {
      const data = await organizationApi.tenants()
      setTenants(data.tenants)
    } catch (error) {
      console.error('Failed to fetch tenants:', error)
    }
  }

  const fetchDepartments = async (tenantId?: string) => {
    try {
      const data = await organizationApi.departmentTree(tenantId)
      setDeptTree(data.departments)  // raw tree for the create-form TreeSelect
    } catch (error) {
      console.error('Failed to fetch departments:', error)
    }
  }

  useEffect(() => {
    fetchAvailableRoles()
    fetchTenants()
    // Load departments for the display column. Tenant admins get their own
    // tenant's tree; platform admins load lazily per selected tenant.
    if (!isPlatformAdmin) fetchDepartments()
    setLoading(false)
  }, [])

  const handleDeleteUser = async (userId: string) => {
    try {
      await usersApi.delete(userId)
      actionRef.current?.reload()
      notify(t('usersManagement.deleteSuccess', 'User deleted'), 'success')
    } catch (error) {
      console.error('Failed to delete user:', error)
      notify(t('usersManagement.deleteFailed'), 'error')
    }
  }

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      await usersApi.update(userId, { is_active: !currentActive })
      actionRef.current?.reload()
      notify(t('usersManagement.operationSuccess', 'Operation succeeded'), 'success')
    } catch (error) {
      console.error('Failed to toggle user status:', error)
      notify(t('usersManagement.operationFailed'), 'error')
    }
  }

  const handleBatchToggleActive = async (active: boolean) => {
    setActionLoading(true)
    try {
      await Promise.all(selectedRows.map(user => usersApi.update(user.id, { is_active: active })))
      setSelectedRows([])
      actionRef.current?.reload()
      notify(t('usersManagement.operationSuccess', 'Operation succeeded'), 'success')
    } catch (error) {
      notify(t('usersManagement.operationFailed'), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBatchAssignRole = async () => {
    if (!batchRole) return
    setActionLoading(true)
    try {
      await Promise.all(selectedRows.map(user => usersApi.update(user.id, { role: batchRole })))
      setSelectedRows([])
      setBatchRoleModalOpen(false)
      setBatchRole('')
      actionRef.current?.reload()
      notify(t('usersManagement.operationSuccess', 'Operation succeeded'), 'success')
    } catch (error) {
      notify(t('usersManagement.operationFailed'), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetUser) return
    const values = await resetForm.validateFields()
    setActionLoading(true)
    try {
      await usersApi.resetPassword(resetUser.id, values.new_password)
      setResetUser(null)
      resetForm.resetFields()
      notify(t('usersManagement.passwordReset'), 'success')
    } catch (error) {
      console.error('Failed to reset password:', error)
      notify(t('usersManagement.resetPasswordFailed'), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateUser = async () => {
    const values = await createForm.validateFields()
    setActionLoading(true)
    try {
      await usersApi.create(values)
      setShowCreateModal(false)
      createForm.resetFields()
      if (values.role === 'service') setShowServiceNotice(true)
      actionRef.current?.reload()
      notify(t('usersManagement.createSuccess', 'User created'), 'success')
    } catch (error: any) {
      const detail = error.response?.data?.detail
      const message = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((item: any) => item.msg || item).join(', ')
          : t('usersManagement.createUserFailed')
      notify(message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const validUsers = useMemo(() => users.filter(user => user && typeof user === 'object' && user.id), [users])
  const activeUsers = useMemo(() => validUsers.filter(user => user.is_active).length, [validUsers])
  const adminUsers = useMemo(() => validUsers.filter(user => user.role === 'admin').length, [validUsers])

  const columns: ProColumns<User>[] = [
    {
      title: t('usersManagement.user'),
      dataIndex: 'email',
      render: (_, user) => (
        <Space>
          <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }}>
            {((user.full_name && user.full_name.trim()) ? user.full_name : user.email)[0]?.toUpperCase()}
          </Avatar>
          <Space direction="vertical" size={0}>
            <Text strong>{user.full_name || '-'}</Text>
            <Text type="secondary">{user.email}</Text>
          </Space>
        </Space>
      ),
    },
    {
      title: t('usersManagement.role'),
      dataIndex: 'role',
      width: 130,
      filters: availableRoles.map(role => ({ text: roleLabels[role.role] || role.role, value: role.role })),
      onFilter: (value, record) => record.role === value,
      render: (_, user) => <Tag color={roleColors[user.role]}>{roleLabels[user.role] || user.role}</Tag>,
    },
    {
      title: t('usersManagement.tenant', 'Tenant'),
      dataIndex: 'tenant_id',
      width: 150,
      hideInTable: !isPlatformAdmin,
      render: (_, user) => {
        if (!user.tenant_id) return <Tag>{t('usersManagement.platformUser', 'Platform')}</Tag>
        const tenant = tenants.find(x => x.id === user.tenant_id)
        return tenant ? <Text>{tenant.name}</Text> : <Text type="secondary">{String(user.tenant_id).slice(0, 8)}</Text>
      },
    },
    {
      title: t('usersManagement.department', 'Department'),
      dataIndex: 'department_id',
      width: 140,
      render: (_, user) => {
        const name = user.department_id ? deptNameMap[user.department_id] : undefined
        return name ? <Text>{name}</Text> : <Text type="secondary">-</Text>
      },
    },
    {
      title: t('usersManagement.status'),
      dataIndex: 'is_active',
      width: 140,
      filters: [
        { text: t('usersManagement.active'), value: true },
        { text: t('usersManagement.disabled'), value: false },
      ],
      onFilter: (value, record) => record.is_active === value,
      render: (_, user) => (
        <Switch
          checked={user.is_active}
          checkedChildren={t('usersManagement.active')}
          unCheckedChildren={t('usersManagement.disabled')}
          onChange={() => handleToggleActive(user.id, user.is_active)}
        />
      ),
    },
    {
      title: t('usersManagement.lastLogin'),
      dataIndex: 'last_login',
      width: 220,
      render: (_, user) => user.last_login ? new Date(user.last_login).toLocaleString() : <Text type="secondary">{t('usersManagement.neverLoggedIn')}</Text>,
    },
    {
      title: t('usersManagement.actions'),
      valueType: 'option',
      width: 150,
      render: (_, user) => [
        <Tooltip key="reset" title={t('usersManagement.resetPassword')}>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => setResetUser(user)} />
        </Tooltip>,
        user.id !== currentUser?.id && (
          <Popconfirm
            key="delete"
            title={t('usersManagement.deleteConfirm')}
            okText={t('common.delete')}
            cancelText={t('common.cancel')}
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteUser(user.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ),
      ],
    },
  ]

  if (loading) {
    return (
      <PageContainer title={t('usersManagement.title')} subTitle={t('usersManagement.subtitle')}>
        <ProCard bordered><Spin style={{ display: 'block', margin: '64px auto' }} /></ProCard>
      </PageContainer>
    )
  }

  return (
    <PageContainer title={t('usersManagement.title')} subTitle={t('usersManagement.subtitle')}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ProCard bordered>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center" wrap>
            <Space direction="vertical" size={4}>
              <Text strong>{t('usersManagement.title')}</Text>
              <Text type="secondary">{t('usersManagement.subtitle')}</Text>
            </Space>
            <Space wrap>
              {isPlatformAdmin && (
                <Select
                  allowClear
                  style={{ minWidth: 180 }}
                  placeholder={t('usersManagement.filterByTenant', 'Filter by tenant')}
                  value={filterTenantId}
                  onChange={(v) => { setFilterTenantId(v); actionRef.current?.reload() }}
                  options={tenants.map(x => ({ label: `${x.name} (${x.code})`, value: x.id }))}
                />
              )}
              <Select
                allowClear
                style={{ minWidth: 150 }}
                placeholder={t('usersManagement.filterByRole', 'Filter by role')}
                value={filterRole}
                onChange={(v) => { setFilterRole(v); actionRef.current?.reload() }}
                options={availableRoles.map(r => ({ label: roleLabels[r.role] || r.role, value: r.role }))}
              />
              <Button icon={<ReloadOutlined />} onClick={() => actionRef.current?.reload()}>{t('common.refresh')}</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                setShowCreateModal(true)
                if (!isPlatformAdmin) fetchDepartments()
              }}>
                {t('usersManagement.createUser')}
              </Button>
            </Space>
          </Space>
        </ProCard>

        <UserStatisticCards
          totalUsers={validUsers.length}
          activeUsers={activeUsers}
          adminUsers={adminUsers}
          t={t}
        />

        <ProCard bordered title={<Space><SafetyCertificateOutlined />{t('usersManagement.userList')} ({validUsers.length})</Space>}>
          <ProTable<User>
            actionRef={actionRef}
            rowKey="id"
            search={false}
            options={false}
            columns={columns}
            rowSelection={{
              selectedRowKeys: selectedRows.map(r => r.id),
              onChange: (_, rows) => setSelectedRows(rows),
              getCheckboxProps: (record) => ({ disabled: record.id === currentUser?.id }),
            }}
            tableAlertRender={({ selectedRowKeys }) => (
              <span>{t('usersManagement.selectedCount', { count: selectedRowKeys.length })}</span>
            )}
            tableAlertOptionRender={() => (
              <Space>
                <Button size="small" onClick={() => handleBatchToggleActive(true)}>{t('usersManagement.batchEnable', 'Enable')}</Button>
                <Button size="small" danger onClick={() => handleBatchToggleActive(false)}>{t('usersManagement.batchDisable', 'Disable')}</Button>
                <Button size="small" onClick={() => setBatchRoleModalOpen(true)}>{t('usersManagement.batchAssignRole', 'Assign Role')}</Button>
              </Space>
            )}
            request={async () => {
              const data: User[] = await fetchUsers({ tenant_id: filterTenantId, role: filterRole })
              const validData = data.filter(user => user && user.id)
              return { data: validData, success: true, total: validData.length }
            }}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            toolBarRender={false}
          />
        </ProCard>
      </Space>

      <Modal
        title={t('usersManagement.createNewUser')}
        open={showCreateModal}
        confirmLoading={actionLoading}
        onOk={handleCreateUser}
        onCancel={() => {
          setShowCreateModal(false)
          createForm.resetFields()
        }}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
      >
        <Form form={createForm} layout="vertical" initialValues={{ role: 'user' }}>
          <Form.Item name="full_name" label={t('usersManagement.fullName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label={t('usersManagement.email')} rules={[{ required: true }, { type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={t('usersManagement.password')} rules={[{ required: true }, { min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label={t('usersManagement.role')} rules={[{ required: true }]}>
            <Select options={availableRoles.map(role => ({ label: roleLabels[role.role] || role.role, value: role.role }))} />
          </Form.Item>
          {isPlatformAdmin && (
            <Form.Item name="tenant_id" label={t('usersManagement.tenant', 'Tenant')}>
              <Select
                allowClear
                placeholder={t('usersManagement.tenantPlaceholder', 'Platform user (no tenant)')}
                options={tenants.map(x => ({ label: `${x.name} (${x.code})`, value: x.id }))}
                onChange={(value) => {
                  setCreateTenantId(value)
                  createForm.setFieldsValue({ department_id: undefined })
                  fetchDepartments(value)
                }}
              />
            </Form.Item>
          )}
          <Form.Item name="department_id" label={t('usersManagement.department', 'Department')}>
            <TreeSelect
              allowClear
              placeholder={t('usersManagement.departmentPlaceholder', 'Select department')}
              disabled={isPlatformAdmin && !createTenantId}
              treeDefaultExpandAll
              treeData={deptToTreeSelect(deptTree)}
              fieldNames={{ label: 'title', value: 'value', children: 'children' }}
              showSearch
              treeNodeFilterProp="title"
            />
          </Form.Item>
          <Form.Item name="data_scope" label={t('usersManagement.dataScope', 'Data Scope')} initialValue="self">
            <Select
              options={[
                { label: t('usersManagement.scopeSelf', 'Own data only'), value: 'self' },
                { label: t('usersManagement.scopeDepartment', 'Department data'), value: 'department' },
                { label: t('usersManagement.scopeTenant', 'All tenant data'), value: 'tenant' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`${t('usersManagement.resetPassword')} - ${resetUser?.email ?? ''}`}
        open={Boolean(resetUser)}
        confirmLoading={actionLoading}
        onOk={handleResetPassword}
        onCancel={() => {
          setResetUser(null)
          resetForm.resetFields()
        }}
        okText={t('usersManagement.confirmReset')}
        cancelText={t('common.cancel')}
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item name="new_password" label={t('usersManagement.enterNewPassword')} rules={[{ required: true }, { min: 8 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      {/* Batch Assign Role Modal */}
      <Modal
        title={t('usersManagement.batchAssignRole', 'Batch Assign Role')}
        open={batchRoleModalOpen}
        confirmLoading={actionLoading}
        onOk={handleBatchAssignRole}
        onCancel={() => { setBatchRoleModalOpen(false); setBatchRole('') }}
        okButtonProps={{ disabled: !batchRole }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert type="info" showIcon message={t('usersManagement.batchAssignInfo', { count: selectedRows.length })} />
          <Select
            value={batchRole || undefined}
            placeholder={t('usersManagement.selectRole', 'Select role...')}
            onChange={setBatchRole}
            style={{ width: '100%' }}
            options={availableRoles.map(role => ({ label: roleLabels[role.role] || role.role, value: role.role }))}
          />
        </Space>
      </Modal>

      <Modal
        title={<Space><KeyOutlined />{t('usersManagement.serviceAccountCreated')}</Space>}
        open={showServiceNotice}
        onOk={() => setShowServiceNotice(false)}
        onCancel={() => setShowServiceNotice(false)}
        footer={<Button type="primary" onClick={() => setShowServiceNotice(false)}>OK</Button>}
      >
        <Alert
          type="info"
          showIcon
          message={t('usersManagement.serviceAccountCreated')}
          description={(
            <Space direction="vertical">
              <Text>{t('usersManagement.serviceAccountNotice')}</Text>
              <Text code>POST /api/v1/system/profile/login</Text>
            </Space>
          )}
        />
      </Modal>
    </PageContainer>
  )
}
