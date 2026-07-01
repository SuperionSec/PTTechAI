import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import {
  App as AntApp,
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tree,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { DataNode } from 'antd/es/tree'
import {
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { organizationApi, usersApi, systemApi } from '../../services/system'
import type { DepartmentNode, Tenant } from '../../services/system'
import { useAccess } from '../../hooks/useAccess'

const { Text } = Typography

interface DeptFormValues {
  name: string
  parent_id?: string | null
  sort_order?: number
  description?: string
}

interface OrgUser {
  id: string
  email: string
  full_name?: string
  role: string
  is_active: boolean
  tenant_id?: string | null
  department_id?: string | null
  data_scope?: string
}

interface MemberFormValues {
  email: string
  password?: string
  full_name: string
  role: string
  data_scope: string
}

export default function DepartmentManagementPage() {
  const { t } = useTranslation()
  const { notification, modal } = AntApp.useApp()
  const access = useAccess()
  const isPlatformAdmin = access.canTenantManage

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState<string | undefined>(undefined)
  const [tree, setTree] = useState<DepartmentNode[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined)
  // Mirror selectedKey into a ref so fetchTree can read the latest value
  // without depending on it (avoids re-creating the callback on every select).
  const selectedKeyRef = useRef<string | undefined>(undefined)
  useEffect(() => { selectedKeyRef.current = selectedKey }, [selectedKey])
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])

  // Department create/edit modal
  const [actionLoading, setActionLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editDept, setEditDept] = useState<DepartmentNode | null>(null)
  const [parentForCreate, setParentForCreate] = useState<string | null>(null)
  const [form] = Form.useForm<DeptFormValues>()

  // Members of the selected department
  const [members, setMembers] = useState<OrgUser[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [roles, setRoles] = useState<string[]>([])
  const [memberModalOpen, setMemberModalOpen] = useState(false)
  const [editMember, setEditMember] = useState<OrgUser | null>(null)
  const [memberForm] = Form.useForm<MemberFormValues>()

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    notification[type]({ message })
  }, [notification])

  // ── data loading ──
  const fetchTenants = useCallback(async () => {
    if (!isPlatformAdmin) return
    try {
      const data = await organizationApi.tenants()
      setTenants(data.tenants)
      if (data.tenants.length && !selectedTenant) setSelectedTenant(data.tenants[0].id)
    } catch (e) {
      console.error('Failed to fetch tenants:', e)
    }
  }, [isPlatformAdmin, selectedTenant])

  const fetchTree = useCallback(async () => {
    setLoading(true)
    try {
      const tenantParam = isPlatformAdmin ? selectedTenant : undefined
      const data = await organizationApi.departmentTree(tenantParam)
      // Compute per-department headcount client-side (robust, independent of
      // backend rollup): fetch this tenant's users once, tally by department,
      // then roll descendant counts up into each node.
      let counts: Record<string, number> = {}
      try {
        const users = await usersApi.list(tenantParam ? { tenant_id: tenantParam } : {})
        for (const u of users as OrgUser[]) {
          if (u.department_id && u.is_active) counts[u.department_id] = (counts[u.department_id] || 0) + 1
        }
      } catch { /* counts stay empty on failure */ }
      const rollup = (n: DepartmentNode): number => {
        let total = counts[n.id] || 0
        for (const ch of n.children || []) total += rollup(ch)
        n.user_count = total
        return total
      }
      data.departments.forEach(rollup)
      setTree([...data.departments])
      const keys: React.Key[] = []
      const collect = (nodes: DepartmentNode[]) => nodes.forEach(n => { keys.push(n.id); if (n.children?.length) collect(n.children) })
      collect(data.departments)
      setExpandedKeys(keys)
      if (data.departments.length && !findNode(data.departments, selectedKeyRef.current)) {
        setSelectedKey(data.departments[0].id)
      }
    } catch (e) {
      console.error('Failed to fetch department tree:', e)
      notify(t('departmentManagement.fetchFailed', 'Failed to fetch departments'), 'error')
    } finally {
      setLoading(false)
    }
  }, [isPlatformAdmin, selectedTenant, notify, t])

  const fetchRoles = useCallback(async () => {
    try {
      const data = await systemApi.roles()
      setRoles(data.map(r => r.role))
    } catch {
      setRoles(['user', 'viewer', 'tenant_admin'])
    }
  }, [])

  useEffect(() => { fetchTenants(); fetchRoles() }, [fetchTenants, fetchRoles])
  useEffect(() => {
    if (!isPlatformAdmin || selectedTenant) fetchTree()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin, selectedTenant])

  // ── helpers ──
  function findNode(nodes: DepartmentNode[], key?: string): DepartmentNode | null {
    if (!key) return null
    for (const n of nodes) {
      if (n.id === key) return n
      const f = findNode(n.children || [], key)
      if (f) return f
    }
    return null
  }

  const flatDepts = useMemo(() => {
    const out: DepartmentNode[] = []
    const walk = (nodes: DepartmentNode[]) => nodes.forEach(n => { out.push(n); if (n.children?.length) walk(n.children) })
    walk(tree)
    return out
  }, [tree])

  const selectedDept = useMemo(() => findNode(tree, selectedKey), [tree, selectedKey])
  const activeTenantId = isPlatformAdmin ? selectedTenant : undefined

  // ── members of selected department ──
  const fetchMembers = useCallback(async () => {
    if (!selectedKey) { setMembers([]); return }
    setMembersLoading(true)
    try {
      const params: { tenant_id?: string; department_id: string } = { department_id: selectedKey }
      if (activeTenantId) params.tenant_id = activeTenantId
      const data = await usersApi.list(params)
      setMembers(data)
    } catch (e) {
      console.error('Failed to fetch members:', e)
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [selectedKey, activeTenantId])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  // ── department CRUD ──
  const openCreate = (parentId: string | null) => {
    setEditDept(null)
    setParentForCreate(parentId)
    form.resetFields()
    form.setFieldsValue({ sort_order: 0, parent_id: parentId })
    setModalOpen(true)
  }
  const openEdit = (dept: DepartmentNode) => {
    setEditDept(dept)
    setParentForCreate(null)
    form.setFieldsValue({ name: dept.name, parent_id: dept.parent_id, sort_order: dept.sort_order, description: dept.description || undefined })
    setModalOpen(true)
  }
  const handleSubmit = async () => {
    const values = await form.validateFields()
    setActionLoading(true)
    try {
      if (editDept) {
        await organizationApi.updateDepartment(editDept.id, { name: values.name, parent_id: values.parent_id ?? null, sort_order: values.sort_order, description: values.description })
        notify(t('departmentManagement.updateSuccess', 'Department updated'), 'success')
      } else {
        await organizationApi.createDepartment({ name: values.name, parent_id: parentForCreate ?? values.parent_id ?? null, sort_order: values.sort_order, description: values.description, tenant_id: activeTenantId })
        notify(t('departmentManagement.createSuccess', 'Department created'), 'success')
      }
      setModalOpen(false); form.resetFields(); fetchTree()
    } catch (e: any) {
      notify(e.response?.data?.detail || t('departmentManagement.saveFailed', 'Failed to save department'), 'error')
    } finally { setActionLoading(false) }
  }
  const handleDelete = async (dept: DepartmentNode) => {
    setActionLoading(true)
    try {
      await organizationApi.deleteDepartment(dept.id)
      notify(t('departmentManagement.deleteSuccess', 'Department deleted'), 'success')
      if (selectedKey === dept.id) setSelectedKey(undefined)
      fetchTree()
    } catch (e: any) {
      notify(e.response?.data?.detail || t('departmentManagement.deleteFailed', 'Failed to delete department'), 'error')
    } finally { setActionLoading(false) }
  }

  // ── member CRUD ──
  const openAddMember = () => {
    setEditMember(null)
    memberForm.resetFields()
    memberForm.setFieldsValue({ role: 'user', data_scope: 'self' })
    setMemberModalOpen(true)
  }
  const openEditMember = (u: OrgUser) => {
    setEditMember(u)
    memberForm.setFieldsValue({ email: u.email, full_name: u.full_name || '', role: u.role, data_scope: u.data_scope || 'self' })
    setMemberModalOpen(true)
  }
  const handleMemberSubmit = async () => {
    const values = await memberForm.validateFields()
    if (!selectedKey) return
    setActionLoading(true)
    try {
      if (editMember) {
        await usersApi.update(editMember.id, { full_name: values.full_name, role: values.role, data_scope: values.data_scope, department_id: selectedKey, ...(values.password ? { password: values.password } : {}) })
        notify(t('departmentManagement.memberUpdated', 'Member updated'), 'success')
      } else {
        await usersApi.create({ email: values.email, password: values.password || '', full_name: values.full_name, role: values.role, data_scope: values.data_scope, department_id: selectedKey, tenant_id: activeTenantId })
        notify(t('departmentManagement.memberAdded', 'Member added'), 'success')
      }
      setMemberModalOpen(false); memberForm.resetFields(); fetchMembers(); fetchTree()
    } catch (e: any) {
      notify(e.response?.data?.detail || t('departmentManagement.memberSaveFailed', 'Failed to save member'), 'error')
    } finally { setActionLoading(false) }
  }
  const handleToggleActive = async (u: OrgUser) => {
    try {
      await usersApi.update(u.id, { is_active: !u.is_active })
      notify(t('common.success', 'Success'), 'success')
      fetchMembers(); fetchTree()
    } catch (e: any) {
      notify(e.response?.data?.detail || t('common.failed', 'Operation failed'), 'error')
    }
  }
  const handleResetPassword = (u: OrgUser) => {
    let pwd = ''
    modal.confirm({
      title: t('departmentManagement.resetPasswordFor', 'Reset password for') + ` ${u.email}`,
      content: <Input.Password placeholder={t('usersManagement.newPassword', 'New password (min 8 chars)')} onChange={(e) => { pwd = e.target.value }} />,
      okText: t('common.confirm', 'Confirm'),
      cancelText: t('common.cancel', 'Cancel'),
      onOk: async () => {
        if (pwd.length < 8) { notify(t('usersManagement.passwordTooShort', 'Password must be at least 8 characters'), 'error'); throw new Error('too short') }
        await usersApi.resetPassword(u.id, pwd)
        notify(t('usersManagement.passwordReset', 'Password reset'), 'success')
      },
    })
  }

  // ── tree render ──
  const treeData: DataNode[] = useMemo(() => {
    const toNode = (d: DepartmentNode): DataNode => ({
      key: d.id,
      title: (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space size={4}>
            <Text>{d.name}</Text>
            <Tag color={d.user_count ? 'blue' : 'default'} style={{ marginInlineStart: 4 }}>
              <TeamOutlined /> {d.user_count ?? 0}
            </Tag>
          </Space>
          <Space size={0} className="dept-node-actions">
            <Button size="small" type="text" icon={<PlusOutlined />} title={t('departmentManagement.addChild', 'Add sub-dept')}
              onClick={(e) => { e.stopPropagation(); openCreate(d.id) }} />
            <Button size="small" type="text" icon={<EditOutlined />} title={t('common.edit', 'Edit')}
              onClick={(e) => { e.stopPropagation(); openEdit(d) }} />
            <Popconfirm title={t('departmentManagement.deleteTitle', 'Delete department')}
              description={t('departmentManagement.deleteConfirm', 'Departments with children or users cannot be deleted.')}
              okText={t('common.delete', 'Delete')} cancelText={t('common.cancel', 'Cancel')} okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(d)}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
            </Popconfirm>
          </Space>
        </Space>
      ),
      children: d.children?.map(toNode),
    })
    return tree.map(toNode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, t])

  const memberColumns: ColumnsType<OrgUser> = [
    { title: t('usersManagement.email', 'Email'), dataIndex: 'email', render: (_, u) => (
      <Space direction="vertical" size={0}>
        <Text strong>{u.full_name || u.email}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{u.email}</Text>
      </Space>
    ) },
    { title: t('usersManagement.role', 'Role'), dataIndex: 'role', width: 130, render: (r: string) => <Tag color={r === 'tenant_admin' ? 'gold' : r === 'admin' ? 'red' : 'default'}>{r}</Tag> },
    { title: t('usersManagement.dataScope', 'Data Scope'), dataIndex: 'data_scope', width: 120, render: (s: string) => <Tag>{s === 'tenant' ? t('usersManagement.scopeTenant', 'All tenant') : s === 'department' ? t('usersManagement.scopeDepartment', 'Department') : t('usersManagement.scopeSelf', 'Own only')}</Tag> },
    { title: t('common.status', 'Status'), dataIndex: 'is_active', width: 90, render: (a: boolean) => <Tag color={a ? 'green' : 'default'}>{a ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}</Tag> },
    { title: t('common.actions', 'Actions'), width: 150, render: (_, u) => (
      <Space size={4}>
        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditMember(u)} />
        <Button size="small" type="text" icon={<KeyOutlined />} title={t('usersManagement.resetPassword', 'Reset password')} onClick={() => handleResetPassword(u)} />
        <Popconfirm title={u.is_active ? t('usersManagement.deactivate', 'Deactivate user') : t('usersManagement.activate', 'Activate user')} onConfirm={() => handleToggleActive(u)} okText={t('common.confirm', 'Confirm')} cancelText={t('common.cancel', 'Cancel')}>
          <Button size="small" type="text" danger={u.is_active}>{u.is_active ? t('usersManagement.deactivate', 'Deactivate') : t('usersManagement.activate', 'Activate')}</Button>
        </Popconfirm>
      </Space>
    ) },
  ]

  const totalHeadcount = tree.reduce((sum, d) => sum + (d.user_count || 0), 0)

  return (
    <PageContainer
      title={t('departmentManagement.title', 'Organization & Departments')}
      subTitle={t('departmentManagement.subtitle', 'Manage the org tree and its members')}
    >
      <style>{`.dept-node-actions{opacity:0;transition:opacity .15s}.ant-tree-treenode:hover .dept-node-actions{opacity:1}`}</style>
      <ProCard split="vertical" bordered>
        {/* LEFT: tree */}
        <ProCard colSpan="34%" title={<Space><ApartmentOutlined />{t('departmentManagement.tree', 'Department Tree')}<Tag>{totalHeadcount} {t('departmentManagement.people', 'people')}</Tag></Space>}
          extra={
            <Space>
              <Button size="small" icon={<ReloadOutlined />} onClick={fetchTree} />
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openCreate(null)}>{t('departmentManagement.createRoot', 'Root Dept')}</Button>
            </Space>
          }
        >
          {isPlatformAdmin && (
            <Select
              style={{ width: '100%', marginBottom: 12 }}
              placeholder={t('departmentManagement.selectTenant', 'Select tenant')}
              value={selectedTenant}
              onChange={(v) => { setSelectedTenant(v); setSelectedKey(undefined) }}
              options={tenants.map(x => ({ value: x.id, label: `${x.name} (${x.code})` }))}
            />
          )}
          {loading ? (
            <Spin style={{ display: 'block', margin: '48px auto' }} />
          ) : tree.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('departmentManagement.empty', 'No departments yet')} />
          ) : (
            <Tree
              treeData={treeData}
              blockNode
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys)}
              selectedKeys={selectedKey ? [selectedKey] : []}
              onSelect={(keys) => keys.length && setSelectedKey(String(keys[0]))}
            />
          )}
        </ProCard>

        {/* RIGHT: detail + members */}
        <ProCard title={selectedDept ? selectedDept.name : t('departmentManagement.selectPrompt', 'Select a department')}>
          {!selectedDept ? (
            <Empty description={t('departmentManagement.selectPrompt', 'Select a department to view details and members')} />
          ) : (
            <Tabs
              items={[
                {
                  key: 'info',
                  label: t('departmentManagement.info', 'Info'),
                  children: (
                    <>
                      <Space style={{ marginBottom: 16 }}>
                        <Button icon={<EditOutlined />} onClick={() => openEdit(selectedDept)}>{t('common.edit', 'Edit')}</Button>
                        <Button icon={<PlusOutlined />} onClick={() => openCreate(selectedDept.id)}>{t('departmentManagement.addChild', 'Add sub-dept')}</Button>
                      </Space>
                      <Descriptions column={1} bordered size="small">
                        <Descriptions.Item label={t('departmentManagement.name', 'Name')}>{selectedDept.name}</Descriptions.Item>
                        <Descriptions.Item label={t('common.description', 'Description')}>{selectedDept.description || '-'}</Descriptions.Item>
                        <Descriptions.Item label={t('departmentManagement.parent', 'Parent')}>{flatDepts.find(d => d.id === selectedDept.parent_id)?.name || t('departmentManagement.noParent', 'None (root)')}</Descriptions.Item>
                        <Descriptions.Item label={t('departmentManagement.headcount', 'Headcount (incl. sub-depts)')}><Tag color="blue"><TeamOutlined /> {selectedDept.user_count ?? 0}</Tag></Descriptions.Item>
                        <Descriptions.Item label={t('departmentManagement.sortOrder', 'Sort Order')}>{selectedDept.sort_order}</Descriptions.Item>
                      </Descriptions>
                    </>
                  ),
                },
                {
                  key: 'members',
                  label: <Space><TeamOutlined />{t('departmentManagement.members', 'Members')}</Space>,
                  children: (
                    <>
                      <Space style={{ marginBottom: 16 }}>
                        <Button type="primary" icon={<UserAddOutlined />} onClick={openAddMember}>{t('departmentManagement.addMember', 'Add Member')}</Button>
                        <Button icon={<ReloadOutlined />} onClick={fetchMembers} />
                      </Space>
                      <Table<OrgUser>
                        rowKey="id"
                        loading={membersLoading}
                        columns={memberColumns}
                        dataSource={members}
                        size="small"
                        pagination={{ pageSize: 10, hideOnSinglePage: true }}
                        locale={{ emptyText: t('departmentManagement.noMembers', 'This department has no direct members') }}
                      />
                    </>
                  ),
                },
              ]}
            />
          )}
        </ProCard>
      </ProCard>

      {/* Department modal */}
      <Modal
        title={editDept ? t('departmentManagement.editDept', 'Edit Department') : t('departmentManagement.newDept', 'New Department')}
        open={modalOpen} confirmLoading={actionLoading} onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        okText={editDept ? t('common.save', 'Save') : t('common.create', 'Create')} cancelText={t('common.cancel', 'Cancel')}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('departmentManagement.name', 'Name')} rules={[{ required: true, message: t('departmentManagement.nameRequired', 'Name is required') }]}>
            <Input />
          </Form.Item>
          <Form.Item name="parent_id" label={t('departmentManagement.parent', 'Parent Department')}>
            <Select allowClear placeholder={t('departmentManagement.noParent', 'None (root)')}
              options={flatDepts.filter(d => !editDept || d.id !== editDept.id).map(d => ({ value: d.id, label: d.name }))} />
          </Form.Item>
          <Form.Item name="sort_order" label={t('departmentManagement.sortOrder', 'Sort Order')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label={t('common.description', 'Description')}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Member modal */}
      <Modal
        title={editMember ? t('departmentManagement.editMember', 'Edit Member') : t('departmentManagement.addMember', 'Add Member')}
        open={memberModalOpen} confirmLoading={actionLoading} onOk={handleMemberSubmit}
        onCancel={() => { setMemberModalOpen(false); memberForm.resetFields() }}
        okText={editMember ? t('common.save', 'Save') : t('common.create', 'Create')} cancelText={t('common.cancel', 'Cancel')}
      >
        <Form form={memberForm} layout="vertical">
          <Form.Item name="email" label={t('usersManagement.email', 'Email')} rules={[{ required: !editMember, type: 'email' }]}>
            <Input disabled={!!editMember} />
          </Form.Item>
          <Form.Item name="full_name" label={t('usersManagement.fullName', 'Full Name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={editMember ? t('usersManagement.newPasswordOptional', 'New Password (leave blank to keep)') : t('usersManagement.password', 'Password')} rules={editMember ? [] : [{ required: true, min: 8 }]}>
            <Input.Password placeholder={editMember ? '••••••' : t('usersManagement.passwordHint', 'Min 8 characters')} />
          </Form.Item>
          <Form.Item name="role" label={t('usersManagement.role', 'Role')} rules={[{ required: true }]}>
            <Select options={roles.map(r => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="data_scope" label={t('usersManagement.dataScope', 'Data Scope')} rules={[{ required: true }]}>
            <Select options={[
              { value: 'self', label: t('usersManagement.scopeSelf', 'Own data only') },
              { value: 'department', label: t('usersManagement.scopeDepartment', 'Department data') },
              { value: 'tenant', label: t('usersManagement.scopeTenant', 'All tenant data') },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
