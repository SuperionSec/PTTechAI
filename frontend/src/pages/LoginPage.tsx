import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd'
import { LockOutlined, MailOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'

const { Text, Title } = Typography

interface LoginFormValues {
  email: string
  password: string
}

export default function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<LoginFormValues>()

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setError('')
    setSubmitting(true)
    try {
      await login(values.email, values.password)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || t('login.loginFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'linear-gradient(135deg, #f0f5ff 0%, #ffffff 45%, #f6ffed 100%)' }}>
      <Card style={{ width: '100%', maxWidth: 420 }} styles={{ body: { padding: 32 } }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space direction="vertical" align="center" size="small" style={{ width: '100%' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e6f4ff', color: '#1677ff' }}>
              <SafetyCertificateOutlined style={{ fontSize: 32 }} />
            </div>
            <Title level={3} style={{ margin: 0 }}>{t('login.title')}</Title>
            <Text type="secondary">{t('login.subtitle')}</Text>
          </Space>

          {error && <Alert type="error" showIcon message={error} />}

          <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
            <Form.Item name="email" label={t('login.email')} rules={[{ required: true, message: t('login.emailPlaceholder') }, { type: 'email', message: t('login.emailPlaceholder') }]}>
              <Input prefix={<MailOutlined />} placeholder={t('login.emailPlaceholder')} autoComplete="email" />
            </Form.Item>

            <Form.Item name="password" label={t('login.password')} rules={[{ required: true, message: t('login.passwordPlaceholder') }]}>
              <Input.Password prefix={<LockOutlined />} placeholder={t('login.passwordPlaceholder')} autoComplete="current-password" />
            </Form.Item>

            <Button type="primary" htmlType="submit" block loading={submitting} size="large">
              {submitting ? t('login.signingIn') : t('login.signIn')}
            </Button>
          </Form>

          <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>{t('login.contactAdmin')}</Text>
        </Space>
      </Card>
    </div>
  )
}
