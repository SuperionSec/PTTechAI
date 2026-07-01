import { useState, useEffect } from 'react'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import {
  Button, Steps, Input, Select, Upload, message, Space, Card, Tag,
  Descriptions, Result, Row, Col, Typography,
} from 'antd'
import {
  UploadOutlined, ArrowLeftOutlined, AndroidOutlined, AppleOutlined,
  MobileOutlined, GlobalOutlined, ApiOutlined, CheckCircleFilled,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { apptestApi } from '../../services/api'
import type { AppTestStrategy } from '../../types'
import { TERMINAL_TYPE_OPTIONS } from '../../types/apptest'

const { Option } = Select
const { Dragger } = Upload
const { Text } = Typography

const MAX_SIZE = 500 * 1024 * 1024

// icon + accept per terminal type
const TYPE_META: Record<number, { icon: React.ReactNode; accept: string }> = {
  1: { icon: <AndroidOutlined />, accept: '.apk,.aab' },
  2: { icon: <AppleOutlined />, accept: '.ipa' },
  9: { icon: <AndroidOutlined />, accept: '.aab,.apk' },
  10: { icon: <MobileOutlined />, accept: '.hap,.app' },
  14: { icon: <MobileOutlined />, accept: '.hap,.app' },
  7: { icon: <ApiOutlined />, accept: '.zip,.aar,.jar' },
  11: { icon: <ApiOutlined />, accept: '.zip,.framework' },
  8: { icon: <ApiOutlined />, accept: '.zip,.bin' },
  12: { icon: <GlobalOutlined />, accept: '.zip,.html' },
}
const defaultAccept = '.apk,.ipa,.hap,.zip,.aab'

export default function AppTestNewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [strategies, setStrategies] = useState<AppTestStrategy[]>([])
  const [loadingStrategies, setLoadingStrategies] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [taskResult, setTaskResult] = useState<{ id: string; name: string } | null>(null)

  const [terminalType, setTerminalType] = useState<number | undefined>(undefined)
  const [appName, setAppName] = useState('')
  const [templateId, setTemplateId] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (terminalType) {
      loadStrategies(terminalType)
    }
  }, [terminalType])

  const loadStrategies = async (type: number) => {
    setLoadingStrategies(true)
    try {
      const resp = await apptestApi.listStrategies(type)
      setStrategies(resp.data.strategies || [])
    } catch (err: any) {
      message.error(err.response?.data?.detail || t('common.loadFailed'))
    } finally {
      setLoadingStrategies(false)
    }
  }

  const resetWizard = () => {
    setCurrentStep(0)
    setTerminalType(undefined)
    setAppName('')
    setTemplateId(undefined)
    setUploadedFile(null)
    setStrategies([])
    setTaskResult(null)
  }

  const handleSubmit = async () => {
    if (!appName.trim()) {
      message.error(t('apptest.appNameRequired'))
      return
    }
    if (!uploadedFile) {
      message.error(t('apptest.pleaseUploadFile'))
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('name', appName)
      formData.append('terminal_type', String(terminalType))
      formData.append('file', uploadedFile)
      if (templateId) {
        formData.append('template_id', templateId)
        const selected = strategies.find(s => String(s.template_id) === templateId)
        if (selected) formData.append('template_name', selected.name)
      }
      const resp = await apptestApi.createTask(formData)
      setTaskResult({ id: resp.data.id, name: resp.data.name })
      setCurrentStep(3)
      message.success(t('apptest.taskCreated'))
    } catch (err: any) {
      message.error(err.response?.data?.detail || t('common.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const steps = [
    { title: t('apptest.step1'), description: t('apptest.step1Desc') },
    { title: t('apptest.step2'), description: t('apptest.step2Desc') },
    { title: t('apptest.step3'), description: t('apptest.step3Desc') },
  ]

  const canNext = () => {
    if (currentStep === 0) return !!terminalType
    if (currentStep === 1) return !!uploadedFile
    return false
  }

  const beforeUpload = (file: File) => {
    if (file.size > MAX_SIZE) {
      message.error(t('apptest.fileTooLarge'))
      return Upload.LIST_IGNORE
    }
    setUploadedFile(file)
    // smart prefill app name from filename (strip extension)
    if (!appName) {
      const base = file.name.replace(/\.[^.]+$/, '')
      setAppName(base)
    }
    return false
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Card title={t('apptest.selectTerminalType')} variant="borderless">
            <Row gutter={[12, 12]}>
              {TERMINAL_TYPE_OPTIONS.map(opt => {
                const selected = terminalType === opt.value
                return (
                  <Col key={opt.value} xs={12} sm={8} md={6} lg={4}>
                    <Card
                      hoverable
                      onClick={() => setTerminalType(opt.value)}
                      styles={{ body: { padding: 16, textAlign: 'center' } }}
                      style={{
                        borderColor: selected ? '#1677ff' : undefined,
                        borderWidth: selected ? 2 : 1,
                        position: 'relative',
                      }}
                    >
                      {selected && <CheckCircleFilled style={{ position: 'absolute', top: 6, right: 6, color: '#1677ff' }} />}
                      <div style={{ fontSize: 24, marginBottom: 8, color: selected ? '#1677ff' : '#888' }}>
                        {TYPE_META[opt.value]?.icon || <MobileOutlined />}
                      </div>
                      <Tag color={opt.color} style={{ margin: 0 }}>{opt.label}</Tag>
                    </Card>
                  </Col>
                )
              })}
            </Row>
          </Card>
        )
      case 1:
        return (
          <Card title={t('apptest.uploadFile')} variant="borderless">
            <Dragger
              beforeUpload={beforeUpload}
              onRemove={() => setUploadedFile(null)}
              fileList={uploadedFile ? [{ uid: '-1', name: uploadedFile.name, status: 'done' as const }] : []}
              accept={terminalType ? (TYPE_META[terminalType]?.accept || defaultAccept) : defaultAccept}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">{t('apptest.dragOrClick')}</p>
              <p className="ant-upload-hint">
                {terminalType ? `${t('apptest.supportedFormats')}: ${TYPE_META[terminalType]?.accept || defaultAccept}` : t('apptest.supportedFormats')}
              </p>
            </Dragger>
            {uploadedFile && (
              <Descriptions title={t('apptest.fileInfo')} size="small" style={{ marginTop: 24 }} column={2}>
                <Descriptions.Item label={t('apptest.fileName')}>{uploadedFile.name}</Descriptions.Item>
                <Descriptions.Item label={t('apptest.fileSize')}>
                  {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                </Descriptions.Item>
              </Descriptions>
            )}
          </Card>
        )
      case 2:
        return (
          <Card title={t('apptest.configureDetection')} variant="borderless">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
                  {t('apptest.appName')}
                </div>
                <Input
                  placeholder={t('apptest.appNamePlaceholder')}
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  maxLength={100}
                  showCount
                  style={{ maxWidth: 400 }}
                />
                <div><Text type="secondary" style={{ fontSize: 12 }}>{t('apptest.appNameHint')}</Text></div>
              </div>
              <div>
                <div style={{ marginBottom: 8 }}>{t('apptest.detectionStrategy')}</div>
                <Select
                  placeholder={t('apptest.selectStrategy')}
                  loading={loadingStrategies}
                  allowClear
                  showSearch
                  optionFilterProp="children"
                  value={templateId}
                  onChange={(v) => setTemplateId(v)}
                  style={{ maxWidth: 400, width: '100%' }}
                >
                  {strategies.map(s => (
                    <Option key={s.template_id} value={String(s.template_id)}>
                      {s.name}{s.detection_item_count ? ` (${s.detection_item_count}${t('apptest.itemsCount')})` : ''}
                    </Option>
                  ))}
                </Select>
                <div><Text type="secondary" style={{ fontSize: 12 }}>{t('apptest.useDefaultStrategy')}</Text></div>
              </div>
            </Space>
          </Card>
        )
      case 3:
        return (
          <Result
            status="success"
            title={t('apptest.createSuccess')}
            subTitle={`${t('apptest.taskId')}: ${taskResult?.id}`}
            extra={[
              <Button type="primary" key="detail" onClick={() => navigate(`/apptest/${taskResult?.id}`)}>
                {t('apptest.viewDetail')}
              </Button>,
              <Button key="continue" onClick={resetWizard}>
                {t('apptest.continueNew')}
              </Button>,
              <Button key="list" onClick={() => navigate('/apptest')}>
                {t('apptest.backToList')}
              </Button>,
            ]}
          />
        )
      default:
        return null
    }
  }

  return (
    <PageContainer
      title={t('apptest.newTask')}
      extra={[
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => navigate('/apptest')}>
          {t('common.back')}
        </Button>,
      ]}
    >
      <ProCard>
        {currentStep < 3 && (
          <Steps
            current={currentStep}
            style={{ marginBottom: 32 }}
            onChange={(s) => { if (s < currentStep) setCurrentStep(s) }}
            items={steps.map(s => ({ title: s.title, description: s.description }))}
          />
        )}

        {renderStepContent()}

        {currentStep < 3 && (
          <Space style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            {currentStep > 0 && (
              <Button onClick={() => setCurrentStep(currentStep - 1)}>
                {t('common.prev')}
              </Button>
            )}
            {currentStep < 2 && (
              <Button type="primary" onClick={() => setCurrentStep(currentStep + 1)} disabled={!canNext()}>
                {t('common.next')}
              </Button>
            )}
            {currentStep === 2 && (
              <Button type="primary" loading={submitting} onClick={handleSubmit}>
                {submitting ? t('apptest.uploadingReport') : t('common.submit')}
              </Button>
            )}
          </Space>
        )}
      </ProCard>
    </PageContainer>
  )
}
