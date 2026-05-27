import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components'
import { Alert, App as AntApp, Avatar, Button, Descriptions, Form, Input, Space, Spin, Tag, Typography } from 'antd'
import { EditOutlined, LockOutlined, SaveOutlined, UserOutlined } from '@ant-design/icons'
import i18n from '../../locales'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'

const { Text } = Typography

interface ProfileFormValues {
  full_name: string
}

interface PasswordFormValues {
  current_password: string
  new_password: string
  confirm_password: string
}

function ProfileStatisticCards({ roleLabel, email, createdAt, t }: {
  roleLabel: string
  email: string
  createdAt: string
  t: (key: string) => string
}) {
  return (
    <StatisticCard.Group direction="row">
      <StatisticCard statistic={{ title: t('usersManagement.role'), value: roleLabel, icon: <UserOutlined /> }} />
      <StatisticCard statistic={{ title: t('login.email'), value: email, icon: <EditOutlined /> }} />
      <StatisticCard statistic={{ title: t('usersManagement.createdAt'), value: createdAt, icon: <LockOutlined /> }} />
    </StatisticCard.Group>
  )
}

export default function UserProfilePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { notification } = AntApp.useApp()
  const [editing, setEditing] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [profileForm] = Form.useForm<ProfileFormValues>()
  const [passwordForm] = Form.useForm<PasswordFormValues>()

  const roleLabels: Record<string, string> = {
    admin: t('usersManagement.admin'),
    user: t('usersManagement.user'),
    viewer: t('usersManagement.viewer'),
    service: 'Service',
  }

  const roleColors: Record<string, string> = {
    admin: 'red',
    user: 'blue',
    viewer: 'default',
    service: 'purple',
  }

  const handleEditProfile = () => {
    profileForm.setFieldsValue({ full_name: user?.full_name || '' })
    setEditing(true)
  }

  const handleSaveProfile = async () => {
    const values = await profileForm.validateFields()
    setProfileLoading(true)
    try {
      await api.put('/auth/me', { full_name: values.full_name })
      notification.success({ message: t('profile.updateSuccess') })
      setEditing(false)
      window.location.reload()
    } catch {
      notification.error({ message: t('profile.updateFailed') })
    } finally {
      setProfileLoading(false)
    }
  }

  const handleChangePassword = async () => {
    const values = await passwordForm.validateFields()
    if (values.new_password !== values.confirm_password) {
      passwordForm.setFields([{ name: 'confirm_password', errors: [t('register.passwordMismatch')] }])
      return
    }

    setPasswordLoading(true)
    try {
      await api.put('/auth/change-password', {
        current_password: values.current_password,
        new_password: values.new_password,
      })
      notification.success({ message: t('profile.passwordChanged') })
      setChangingPassword(false)
      passwordForm.resetFields()
    } catch (error: any) {
      notification.error({ message: error.response?.data?.detail || t('profile.changeFailed') })
    } finally {
      setPasswordLoading(false)
    }
  }

  if (!user) {
    return (
      <PageContainer title={t('profile.title')} subTitle={t('profile.subtitle')}>
        <ProCard bordered><Spin style={{ display: 'block', margin: '64px auto' }} /></ProCard>
      </PageContainer>
    )
  }

  const displayName = user.full_name || user.email

  return (
    <PageContainer title={t('profile.title')} subTitle={t('profile.subtitle')}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ProCard bordered>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center" wrap>
            <Space align="center" size="large" wrap>
              <Avatar size={72} icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }}>
                {displayName[0]?.toUpperCase()}
              </Avatar>
              <Space direction="vertical" size={0}>
                <Text strong style={{ fontSize: 20 }}>{displayName}</Text>
                <Text type="secondary">{user.email}</Text>
                <Tag color={roleColors[user.role]} style={{ marginTop: 8 }}>{roleLabels[user.role] || user.role}</Tag>
              </Space>
            </Space>
            <Text type="secondary">{t('profile.subtitle')}</Text>
          </Space>
        </ProCard>

        <ProfileStatisticCards
          roleLabel={roleLabels[user.role] || user.role}
          email={user.email}
          createdAt={new Date(user.created_at).toLocaleDateString(i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US')}
          t={t}
        />

        <ProCard
          bordered
          title={<Space><UserOutlined />{t('profile.personalInfo')}</Space>}
          extra={!editing && <Button icon={<EditOutlined />} onClick={handleEditProfile}>{t('common.edit')}</Button>}
        >
          {editing ? (
            <Form form={profileForm} layout="vertical" initialValues={{ full_name: user.full_name || '' }}>
              <Form.Item name="full_name" label={t('usersManagement.fullName')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label={t('login.email')}>
                <Input value={user.email} disabled />
              </Form.Item>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
                <Button type="primary" icon={<SaveOutlined />} loading={profileLoading} onClick={handleSaveProfile}>{t('common.save')}</Button>
              </Space>
            </Form>
          ) : (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('usersManagement.fullName')}>{user.full_name || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('login.email')}>{user.email}</Descriptions.Item>
              <Descriptions.Item label={t('usersManagement.role')}>
                <Tag color={roleColors[user.role]}>{roleLabels[user.role] || user.role}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('usersManagement.createdAt')}>
                {new Date(user.created_at).toLocaleString(i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US')}
              </Descriptions.Item>
            </Descriptions>
          )}
        </ProCard>

        <ProCard
          bordered
          title={<Space><LockOutlined />{t('profile.changePassword')}</Space>}
          extra={!changingPassword && <Button icon={<EditOutlined />} onClick={() => setChangingPassword(true)}>{t('common.edit')}</Button>}
        >
          {changingPassword ? (
            <Form form={passwordForm} layout="vertical">
              <Form.Item name="current_password" label={t('profile.currentPassword')} rules={[{ required: true }]}>
                <Input.Password />
              </Form.Item>
              <Form.Item name="new_password" label={t('profile.newPassword')} rules={[{ required: true }, { min: 6, message: t('register.passwordTooShort') }]}>
                <Input.Password />
              </Form.Item>
              <Form.Item name="confirm_password" label={t('profile.confirmNewPassword')} rules={[{ required: true }]}>
                <Input.Password />
              </Form.Item>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => {
                  setChangingPassword(false)
                  passwordForm.resetFields()
                }}>
                  {t('common.cancel')}
                </Button>
                <Button type="primary" icon={<LockOutlined />} loading={passwordLoading} onClick={handleChangePassword}>{t('profile.confirmChange')}</Button>
              </Space>
            </Form>
          ) : (
            <Alert type="info" showIcon message={t('profile.passwordSecurity', 'Use a strong password and change it regularly.')} />
          )}
        </ProCard>
      </Space>
    </PageContainer>
  )
}
