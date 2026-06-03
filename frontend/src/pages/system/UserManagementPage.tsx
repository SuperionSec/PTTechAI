import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { systemApi, usersApi } from '../../services/system'
import type { RoleSummary } from '../../services/system'

const { Text } = Typography

interface User {
  id: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string
  last_login: string | null
}

interface CreateUserForm {
  email: string
  password: string
  full_name: string
  role: string
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
  const navigate = useNavigate()
  const { notification } = AntApp.useApp()
  const actionRef = useRef<ActionType>()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [resetUser, setResetUser] = useState<User | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showServiceNotice, setShowServiceNotice] = useState(false)
  const [availableRoles, setAvailableRoles] = useState<RoleSummary[]>([])
  const [createForm] = Form.useForm<CreateUserForm>()
  const [resetForm] = Form.useForm<ResetPasswordForm>()

  const roleLabels: Record<string, string> = useMemo(() => ({
    admin: t('usersManagement.admin'),
    user: t('usersManagement.user'),
    viewer: t('usersManagement.viewer'),
    service: 'Service',
  }), [t])

  const roleColors: Record<string, string> = {
    admin: 'red',
    user: 'blue',
    viewer: 'default',
    service: 'purple',
  }

  const notify = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    notification[type]({ message })
  }

  const fetchUsers = async () => {
    try {
      const data = await usersApi.list()
      setUsers(data)
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

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      navigate('/')
      return
    }
    fetchAvailableRoles()
    setLoading(false)
  }, [currentUser, navigate])

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
              <Button icon={<ReloadOutlined />} onClick={() => actionRef.current?.reload()}>{t('common.refresh')}</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreateModal(true)}>
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
            request={async () => {
              const data: User[] = await fetchUsers()
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

      <Modal
        title={<Space><KeyOutlined />Service Account Created</Space>}
        open={showServiceNotice}
        onOk={() => setShowServiceNotice(false)}
        onCancel={() => setShowServiceNotice(false)}
        footer={<Button type="primary" onClick={() => setShowServiceNotice(false)}>OK</Button>}
      >
        <Alert
          type="info"
          showIcon
          message="The service account has been created successfully."
          description={(
            <Space direction="vertical">
              <Text>This account can only be used for API access and cannot log in to the web interface.</Text>
              <Text code>POST /api/v1/auth/login</Text>
            </Space>
          )}
        />
      </Modal>
    </PageContainer>
  )
}
