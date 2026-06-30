import { useState, useEffect } from 'react'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import {
  Button, Steps, Input, Select, Upload, message, Space, Card, Tag,
  Descriptions, Result,
} from 'antd'
import { UploadOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { apptestApi } from '../../services/api'
import type { AppTestStrategy } from '../../types'
import { TERMINAL_TYPE_OPTIONS } from '../../types/apptest'

const { Step } = Steps
const { Option } = Select
const { Dragger } = Upload

export default function AppTestNewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [strategies, setStrategies] = useState<AppTestStrategy[]>([])
  const [loadingStrategies, setLoadingStrategies] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [taskResult, setTaskResult] = useState<{ id: string; name: string } | null>(null)

  // Controlled form state (avoids cross-step Form context issues)
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
        if (selected) {
          formData.append('template_name', selected.name)
        }
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

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Card title={t('apptest.selectTerminalType')} variant="borderless">
            <Space direction="vertical" style={{ width: '100%' }}>
              <span>{t('apptest.terminalType')}</span>
              <Select
                placeholder={t('apptest.selectTerminalType')}
                style={{ width: 300 }}
                value={terminalType}
                onChange={(v) => setTerminalType(v)}
              >
                {TERMINAL_TYPE_OPTIONS.map(opt => (
                  <Option key={opt.value} value={opt.value}>
                    <Tag color={opt.color}>{opt.label}</Tag>
                  </Option>
                ))}
              </Select>
            </Space>
          </Card>
        )
      case 1:
        return (
          <Card title={t('apptest.uploadFile')} variant="borderless">
            <Dragger
              beforeUpload={(file) => {
                setUploadedFile(file)
                return false
              }}
              onRemove={() => setUploadedFile(null)}
              fileList={uploadedFile ? [{ uid: '-1', name: uploadedFile.name, status: 'done' as const }] : []}
              accept=".apk,.ipa,.hap,.zip,.aab"
              maxCount={1}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">{t('apptest.dragOrClick')}</p>
              <p className="ant-upload-hint">
                {t('apptest.supportedFormats')}
              </p>
            </Dragger>
            {uploadedFile && (
              <Descriptions
                title={t('apptest.fileInfo')}
                size="small"
                style={{ marginTop: 24 }}
                column={2}
              >
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
                  style={{ maxWidth: 400 }}
                />
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
              <Button
                type="primary"
                key="detail"
                onClick={() => navigate(`/apptest/${taskResult?.id}`)}
              >
                {t('apptest.viewDetail')}
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
          <Steps current={currentStep} style={{ marginBottom: 32 }}>
            {steps.map((s, i) => (
              <Step key={i} title={s.title} description={s.description} />
            ))}
          </Steps>
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
                {t('common.submit')}
              </Button>
            )}
          </Space>
        )}
      </ProCard>
    </PageContainer>
  )
}
