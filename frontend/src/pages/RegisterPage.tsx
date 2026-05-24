import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd'
import { LockOutlined, MailOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'

const { Text, Title } = Typography

interface RegisterFormValues {
  fullName?: string
  email: string
  password: string
  confirmPassword: string
}

export default function RegisterPage() {
  const { t } = useTranslation()
  const { register } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<RegisterFormValues>()

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setError('')

    if (values.password !== values.confirmPassword) {
      form.setFields([{ name: 'confirmPassword', errors: [t('register.passwordMismatch')] }])
      return
    }

    setSubmitting(true)
    try {
      await register(values.email, values.password, values.fullName || undefined)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || t('register.registrationFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'linear-gradient(135deg, #f0f5ff 0%, #ffffff 45%, #f6ffed 100%)' }}>
      <Card style={{ width: '100%', maxWidth: 440 }} styles={{ body: { padding: 32 } }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space direction="vertical" align="center" size="small" style={{ width: '100%' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e6f4ff', color: '#1677ff' }}>
              <SafetyCertificateOutlined style={{ fontSize: 32 }} />
            </div>
            <Title level={3} style={{ margin: 0 }}>{t('login.title')}</Title>
            <Text type="secondary">{t('register.subtitle')}</Text>
          </Space>

          {error && <Alert type="error" showIcon message={error} />}

          <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
            <Form.Item name="fullName" label={t('usersManagement.fullName')}>
              <Input prefix={<UserOutlined />} placeholder={t('register.fullNamePlaceholder')} autoComplete="name" />
            </Form.Item>

            <Form.Item name="email" label={t('login.email')} rules={[{ required: true, message: t('register.emailPlaceholder') }, { type: 'email', message: t('register.emailPlaceholder') }]}>
              <Input prefix={<MailOutlined />} placeholder={t('register.emailPlaceholder')} autoComplete="email" />
            </Form.Item>

            <Form.Item name="password" label={t('login.password')} rules={[{ required: true, message: t('login.passwordPlaceholder') }, { min: 6, message: t('register.passwordTooShort') }]}>
              <Input.Password prefix={<LockOutlined />} placeholder={t('login.passwordPlaceholder')} autoComplete="new-password" />
            </Form.Item>

            <Form.Item name="confirmPassword" label={t('usersManagement.confirmPassword')} rules={[{ required: true, message: t('login.passwordPlaceholder') }]}>
              <Input.Password prefix={<LockOutlined />} placeholder={t('login.passwordPlaceholder')} autoComplete="new-password" />
            </Form.Item>

            <Button type="primary" htmlType="submit" block loading={submitting} size="large">
              {submitting ? t('register.creatingAccount') : t('register.createAccount')}
            </Button>
          </Form>

          <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
            {t('register.alreadyHaveAccount')}{' '}
            <Link to="/login">{t('register.signIn')}</Link>
          </Text>
        </Space>
      </Card>
    </div>
  )
}
