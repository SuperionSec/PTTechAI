import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import {
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  BankOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  StopOutlined,
  TeamOutlined,
  UserAddOutlined,
  ApartmentOutlined,
} from '@ant-design/icons'
import { organizationApi, usersApi } from '../../services/system'
import type { DepartmentNode, Tenant } from '../../services/system'

const { Text } = Typography

interface TenantFormValues {
  code: string
  name: string
  contact_email?: string
  contact_phone?: string
  max_users?: number
  max_storage_gb?: number
}

export default function TenantManagementPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const actionRef = useRef<ActionType>()

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editTenant, setEditTenant] = useState<Tenant | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [form] = Form.useForm<TenantFormValues>()

  // Detail drawer: overview of a tenant's departments + admins
  const [viewTenant, setViewTenant] = useState<Tenant | null>(null)
  const [drawerDepts, setDrawerDepts] = useState<DepartmentNode[]>([])
  const [drawerAdmins, setDrawerAdmins] = useState<Array<{ id: string; email: string; full_name?: string; role: string }>>([])
  const [drawerUsers, setDrawerUsers] = useState<Array<{ id: string; email: string; full_name?: string; role: string }>>([])
  const [drawerLoading, setDrawerLoading] = useState(false)
  // Set-admin modal (pick an existing tenant user to promote)
  const [setAdminOpen, setSetAdminOpen] = useState(false)
  const [setAdminUserId, setSetAdminUserId] = useState<string | undefined>(undefined)

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    notification[type]({ message })
  }, [notification])

  const fetchTenants = useCallback(async () => {
    try {
      const data = await organizationApi.tenants()
      setTenants(data.tenants)
      return data.tenants
    } catch (error) {
      console.error('Failed to fetch tenants:', error)
      notify(t('tenantManagement.fetchFailed', 'Failed to fetch tenants'), 'error')
      return []
    }
  }, [notify, t])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  const openCreate = () => {
    form.resetFields()
    setCreateOpen(true)
  }

  const openEdit = (tenant: Tenant) => {
    setEditTenant(tenant)
    form.setFieldsValue({
      code: tenant.code,
      name: tenant.name,
      contact_email: tenant.contact_email || undefined,
      contact_phone: tenant.contact_phone || undefined,
      max_users: tenant.max_users || undefined,
      max_storage_gb: tenant.max_storage_gb || undefined,
    })
  }

  const handleCreate = async () => {
    const values = await form.validateFields()
    setActionLoading(true)
    try {
      await organizationApi.createTenant(values)
      setCreateOpen(false)
      form.resetFields()
      actionRef.current?.reload()
      notify(t('tenantManagement.createSuccess', 'Tenant created'), 'success')
    } catch (error: any) {
      notify(error.response?.data?.detail || t('tenantManagement.createFailed', 'Failed to create tenant'), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleEdit = async () => {
    if (!editTenant) return
    const values = await form.validateFields()
    setActionLoading(true)
    try {
      await organizationApi.updateTenant(editTenant.id, {
        name: values.name,
        contact_email: values.contact_email,
        contact_phone: values.contact_phone,
        max_users: values.max_users,
        max_storage_gb: values.max_storage_gb,
      })
      setEditTenant(null)
      form.resetFields()
      actionRef.current?.reload()
      notify(t('tenantManagement.updateSuccess', 'Tenant updated'), 'success')
    } catch (error: any) {
      notify(error.response?.data?.detail || t('tenantManagement.updateFailed', 'Failed to update tenant'), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const loadTenantDetail = async (tenant: Tenant) => {
    setDrawerLoading(true)
    try {
      const [treeData, admins, allUsers] = await Promise.all([
        organizationApi.departmentTree(tenant.id),
        usersApi.list({ tenant_id: tenant.id, role: 'tenant_admin' }),
        usersApi.list({ tenant_id: tenant.id }),
      ])
      const counts: Record<string, number> = {}
      for (const u of allUsers as Array<{ department_id?: string | null; is_active: boolean }>) {
        if (u.department_id && u.is_active) counts[u.department_id] = (counts[u.department_id] || 0) + 1
      }
      const rollup = (n: DepartmentNode): number => {
        let total = counts[n.id] || 0
        for (const ch of n.children || []) total += rollup(ch)
        n.user_count = total
        return total
      }
      treeData.departments.forEach(rollup)
      setDrawerDepts([...treeData.departments])
      setDrawerAdmins(admins)
      setDrawerUsers(allUsers)
    } catch (error) {
      console.error('Failed to load tenant detail:', error)
      notify(t('tenantManagement.detailFailed', 'Failed to load tenant detail'), 'error')
    } finally {
      setDrawerLoading(false)
    }
  }

  const openView = async (tenant: Tenant) => {
    setViewTenant(tenant)
    setDrawerDepts([])
    setDrawerAdmins([])
    setDrawerUsers([])
    await loadTenantDetail(tenant)
  }

  const handleSetAdmin = async () => {
    if (!viewTenant || !setAdminUserId) return
    setActionLoading(true)
    try {
      await organizationApi.setTenantAdmin(viewTenant.id, setAdminUserId, true)
      notify(t('tenantManagement.adminSet', 'Tenant administrator set'), 'success')
      setSetAdminOpen(false)
      setSetAdminUserId(undefined)
      await loadTenantDetail(viewTenant)
      actionRef.current?.reload()
    } catch (error: any) {
      notify(error.response?.data?.detail || t('tenantManagement.adminSetFailed', 'Failed to set admin'), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveAdmin = async (userId: string) => {
    if (!viewTenant) return
    setActionLoading(true)
    try {
      await organizationApi.setTenantAdmin(viewTenant.id, userId, false)
      notify(t('tenantManagement.adminRemoved', 'Tenant administrator removed'), 'success')
      await loadTenantDetail(viewTenant)
      actionRef.current?.reload()
    } catch (error: any) {
      notify(error.response?.data?.detail || t('tenantManagement.adminRemoveFailed', 'Failed to remove admin'), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSuspend = async (tenant: Tenant) => {
    setActionLoading(true)
    try {
      await organizationApi.suspendTenant(tenant.id)
      actionRef.current?.reload()
      notify(t('tenantManagement.suspendSuccess', 'Tenant suspended'), 'success')
    } catch (error: any) {
      notify(error.response?.data?.detail || t('tenantManagement.suspendFailed', 'Failed to suspend tenant'), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const tenantForm = (codeDisabled: boolean) => (
    <Form form={form} layout="vertical">
      <Form.Item
        name="code"
        label={t('tenantManagement.code', 'Tenant Code')}
        rules={[{ required: true, message: t('tenantManagement.codeRequired', 'Tenant code is required') }]}
      >
        <Input disabled={codeDisabled} placeholder="acme-corp" />
      </Form.Item>
      <Form.Item
        name="name"
        label={t('tenantManagement.name', 'Company Name')}
        rules={[{ required: true, message: t('tenantManagement.nameRequired', 'Company name is required') }]}
      >
        <Input placeholder="Acme Corp" />
      </Form.Item>
      <Form.Item name="contact_email" label={t('tenantManagement.contactEmail', 'Contact Email')}>
        <Input type="email" />
      </Form.Item>
      <Form.Item name="contact_phone" label={t('tenantManagement.contactPhone', 'Contact Phone')}>
        <Input />
      </Form.Item>
      <Space size="large">
        <Form.Item name="max_users" label={t('tenantManagement.maxUsers', 'Max Users')}>
          <InputNumber min={1} placeholder="∞" />
        </Form.Item>
        <Form.Item name="max_storage_gb" label={t('tenantManagement.maxStorage', 'Max Storage (GB)')}>
          <InputNumber min={1} placeholder="∞" />
        </Form.Item>
      </Space>
    </Form>
  )

  const columns: ProColumns<Tenant>[] = [
    {
      title: t('tenantManagement.name', 'Company'),
      dataIndex: 'name',
      render: (_, tenant) => (
        <Space direction="vertical" size={0}>
          <Text strong>{tenant.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{tenant.code}</Text>
        </Space>
      ),
    },
    {
      title: t('common.status', 'Status'),
      dataIndex: 'status',
      width: 120,
      render: (_, tenant) => (
        <Tag color={tenant.status === 'active' && tenant.is_active ? 'green' : 'default'}>
          {tenant.status === 'active' && tenant.is_active
            ? t('tenantManagement.active', 'Active')
            : t('tenantManagement.suspended', 'Suspended')}
        </Tag>
      ),
    },
    {
      title: t('tenantManagement.users', 'Users'),
      dataIndex: 'user_count',
      width: 120,
      render: (_, tenant) => <Space><TeamOutlined />{tenant.user_count}{tenant.max_users ? ` / ${tenant.max_users}` : ''}</Space>,
    },
    {
      title: t('tenantManagement.departments', 'Departments'),
      dataIndex: 'department_count',
      width: 140,
      render: (_, tenant) => <Space><ApartmentOutlined />{tenant.department_count}</Space>,
    },
    {
      title: t('common.actions', 'Actions'),
      valueType: 'option',
      width: 170,
      render: (_, tenant) => [
        <Tooltip key="view" title={t('tenantManagement.viewDetail', 'View detail')}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openView(tenant)} />
        </Tooltip>,
        <Tooltip key="edit" title={t('common.edit', 'Edit')}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(tenant)} />
        </Tooltip>,
        <Popconfirm
          key="suspend"
          title={t('tenantManagement.suspendTitle', 'Suspend tenant')}
          description={t('tenantManagement.suspendConfirm', 'The tenant will be disabled but data preserved.')}
          okText={t('tenantManagement.suspend', 'Suspend')}
          cancelText={t('common.cancel', 'Cancel')}
          okButtonProps={{ danger: true }}
          onConfirm={() => handleSuspend(tenant)}
          disabled={!tenant.is_active}
        >
          <Button size="small" danger disabled={!tenant.is_active} icon={<StopOutlined />} />
        </Popconfirm>,
      ],
    },
  ]

  const activeCount = tenants.filter(x => x.is_active && x.status === 'active').length

  return (
    <PageContainer
      title={t('tenantManagement.title', 'Tenant Management')}
      subTitle={t('tenantManagement.subtitle', 'Manage customer companies (tenants)')}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: t('tenantManagement.total', 'Total Tenants'), value: tenants.length, icon: <BankOutlined /> }} />
          <StatisticCard statistic={{ title: t('tenantManagement.active', 'Active'), value: activeCount, icon: <TeamOutlined /> }} />
        </StatisticCard.Group>

        <ProCard bordered title={<Space><BankOutlined />{t('tenantManagement.title', 'Tenants')}</Space>}
          extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('tenantManagement.createTenant', 'New Tenant')}</Button>}
        >
          <ProTable<Tenant>
            actionRef={actionRef}
            rowKey="id"
            search={false}
            options={false}
            columns={columns}
            request={async () => {
              const data = await fetchTenants()
              return { data, success: true, total: data.length }
            }}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            toolBarRender={false}
          />
        </ProCard>
      </Space>

      <Modal
        title={t('tenantManagement.createTenant', 'New Tenant')}
        open={createOpen}
        confirmLoading={actionLoading}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields() }}
        okText={t('common.create', 'Create')}
        cancelText={t('common.cancel', 'Cancel')}
      >
        {tenantForm(false)}
      </Modal>

      <Modal
        title={`${t('common.edit', 'Edit')} - ${editTenant?.name ?? ''}`}
        open={Boolean(editTenant)}
        confirmLoading={actionLoading}
        onOk={handleEdit}
        onCancel={() => { setEditTenant(null); form.resetFields() }}
        okText={t('common.save', 'Save')}
        cancelText={t('common.cancel', 'Cancel')}
      >
        {tenantForm(true)}
      </Modal>

      <Drawer
        title={viewTenant ? `${viewTenant.name} · ${t('tenantManagement.overview', 'Overview')}` : ''}
        open={Boolean(viewTenant)}
        onClose={() => setViewTenant(null)}
        width={520}
      >
        {viewTenant && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('tenantManagement.code', 'Code')}>{viewTenant.code}</Descriptions.Item>
              <Descriptions.Item label={t('common.status', 'Status')}>
                <Tag color={viewTenant.status === 'active' && viewTenant.is_active ? 'green' : 'default'}>
                  {viewTenant.status === 'active' && viewTenant.is_active ? t('tenantManagement.active', 'Active') : t('tenantManagement.suspended', 'Suspended')}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('tenantManagement.contactEmail', 'Contact Email')}>{viewTenant.contact_email || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('tenantManagement.users', 'Users')}>{viewTenant.user_count}{viewTenant.max_users ? ` / ${viewTenant.max_users}` : ''}</Descriptions.Item>
              <Descriptions.Item label={t('tenantManagement.departments', 'Departments')}>{viewTenant.department_count}</Descriptions.Item>
            </Descriptions>

            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text strong><TeamOutlined /> {t('tenantManagement.admins', 'Tenant Administrators')}</Text>
                <Button size="small" icon={<UserAddOutlined />} onClick={() => { setSetAdminUserId(undefined); setSetAdminOpen(true) }}>
                  {t('tenantManagement.setAdmin', 'Set Admin')}
                </Button>
              </Space>
              <Table
                style={{ marginTop: 8 }}
                rowKey="id"
                size="small"
                loading={drawerLoading}
                pagination={false}
                dataSource={drawerAdmins}
                locale={{ emptyText: t('tenantManagement.noAdmins', 'No tenant administrators assigned') }}
                columns={[
                  { title: t('usersManagement.email', 'Email'), dataIndex: 'email', render: (_: string, u: any) => (
                    <Space direction="vertical" size={0}><Text strong>{u.full_name || u.email}</Text><Text type="secondary" style={{ fontSize: 12 }}>{u.email}</Text></Space>
                  ) },
                  { title: t('usersManagement.role', 'Role'), dataIndex: 'role', width: 110, render: (r: string) => <Tag color="gold">{r}</Tag> },
                  { title: t('common.actions', 'Actions'), width: 90, render: (_: any, u: any) => (
                    <Popconfirm
                      title={t('tenantManagement.removeAdminConfirm', 'Demote this administrator to a regular user?')}
                      okText={t('common.confirm', 'Confirm')} cancelText={t('common.cancel', 'Cancel')}
                      onConfirm={() => handleRemoveAdmin(u.id)}
                    >
                      <Button size="small" type="link" danger>{t('tenantManagement.removeAdmin', 'Remove')}</Button>
                    </Popconfirm>
                  ) },
                ]}
              />
            </div>

            <div>
              <Text strong><ApartmentOutlined /> {t('tenantManagement.deptTree', 'Department Tree')}</Text>
              <div style={{ marginTop: 8, maxHeight: 320, overflow: 'auto' }}>
                {drawerLoading ? null : drawerDepts.length === 0 ? (
                  <Text type="secondary">{t('departmentManagement.empty', 'No departments yet')}</Text>
                ) : (
                  <DeptTreeReadonly nodes={drawerDepts} />
                )}
              </div>
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        title={t('tenantManagement.setAdmin', 'Set Tenant Administrator')}
        open={setAdminOpen}
        confirmLoading={actionLoading}
        onOk={handleSetAdmin}
        onCancel={() => { setSetAdminOpen(false); setSetAdminUserId(undefined) }}
        okText={t('common.confirm', 'Confirm')}
        cancelText={t('common.cancel', 'Cancel')}
        okButtonProps={{ disabled: !setAdminUserId }}
      >
        <Text type="secondary">{t('tenantManagement.setAdminHint', 'Promote an existing tenant user to tenant administrator.')}</Text>
        <Select
          style={{ width: '100%', marginTop: 12 }}
          showSearch
          placeholder={t('tenantManagement.selectUser', 'Select a user')}
          value={setAdminUserId}
          onChange={setSetAdminUserId}
          optionFilterProp="label"
          options={drawerUsers
            .filter(u => u.role !== 'tenant_admin')
            .map(u => ({ label: `${u.full_name || u.email} (${u.email})`, value: u.id }))}
          notFoundContent={t('tenantManagement.noEligibleUsers', 'No eligible users (all are already admins)')}
        />
      </Modal>
    </PageContainer>
  )
}

function DeptTreeReadonly({ nodes, depth = 0 }: { nodes: DepartmentNode[]; depth?: number }) {
  return (
    <div>
      {nodes.map(n => (
        <div key={n.id}>
          <div style={{ paddingLeft: depth * 18, padding: '4px 0' }}>
            <Space size={4}>
              <ApartmentOutlined style={{ color: '#8c8c8c' }} />
              <Text>{n.name}</Text>
              <Tag color={n.user_count ? 'blue' : 'default'}><TeamOutlined /> {n.user_count ?? 0}</Tag>
            </Space>
          </div>
          {n.children?.length ? <DeptTreeReadonly nodes={n.children} depth={depth + 1} /> : null}
        </div>
      ))}
    </div>
  )
}
