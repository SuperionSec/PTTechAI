import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Collapse,
  Empty,
  Flex,
  Input,
  List,
  Radio,
  Segmented,
  Slider,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
} from 'antd'
import {
  BookOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  KeyOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { agentApi, targetsApi } from '../services/api'
import type { AgentTask, AgentMode, AgentRequest } from '../types'

const { Text, Title, Paragraph } = Typography
const { TextArea } = Input

type TargetInputMode = 'single' | 'multiple' | 'file'
type AuthTypeOption = 'none' | 'cookie' | 'bearer' | 'basic' | 'header'

interface OperationModeInfo {
  id: AgentMode
  name: string
  icon: React.ReactNode
  description: string
  warning?: string
  color: string
}

const getOperationModes = (t: (key: string) => string): OperationModeInfo[] => [
  {
    id: 'full_auto',
    name: t('newScan.fullAuto'),
    icon: <RobotOutlined />,
    description: t('newScan.fullAutoDesc'),
    color: '#1677ff',
  },
  {
    id: 'recon_only',
    name: t('newScan.reconOnly'),
    icon: <SearchOutlined />,
    description: t('newScan.reconOnlyDesc'),
    color: '#13c2c2',
  },
  {
    id: 'prompt_only',
    name: t('newScan.promptOnly'),
    icon: <CodeOutlined />,
    description: t('newScan.promptOnlyDesc'),
    warning: t('newScan.promptOnlyWarning'),
    color: '#722ed1',
  },
  {
    id: 'analyze_only',
    name: t('newScan.analyzeOnly'),
    icon: <ExperimentOutlined />,
    description: t('newScan.analyzeOnlyDesc'),
    color: '#52c41a',
  },
]

const getTaskCategories = (t: (key: string) => string) => [
  { id: 'all', name: t('newScan.allTasks') },
  { id: 'full_auto', name: t('newScan.fullAuto') },
  { id: 'recon', name: t('newScan.reconTasks') },
  { id: 'vulnerability', name: t('newScan.vulnTasks') },
  { id: 'custom', name: t('newScan.customTasks') },
  { id: 'reporting', name: t('newScan.reportingTasks') },
]

const getAuthTypeOptions = (t: (key: string) => string): { id: AuthTypeOption; label: string }[] => [
  { id: 'none', label: t('newScan.authNone') },
  { id: 'cookie', label: t('newScan.authCookie') },
  { id: 'bearer', label: t('newScan.authBearer') },
  { id: 'basic', label: t('newScan.authBasic') },
  { id: 'header', label: t('newScan.authHeader') },
]

function authPlaceholder(authType: AuthTypeOption) {
  if (authType === 'cookie') return 'session=abc123; token=xyz789'
  if (authType === 'bearer') return 'eyJhbGciOiJIUzI1NiIs...'
  if (authType === 'basic') return 'username:password'
  return 'X-API-Key: your-api-key'
}

export default function NewScanPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()

  const operationModes = useMemo(() => getOperationModes(t), [t])
  const taskCategories = useMemo(() => getTaskCategories(t), [t])
  const authTypeOptions = useMemo(() => getAuthTypeOptions(t), [t])

  const [targetMode, setTargetMode] = useState<TargetInputMode>('single')
  const [singleUrl, setSingleUrl] = useState('')
  const [multipleUrls, setMultipleUrls] = useState('')
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([])
  const [urlError, setUrlError] = useState('')
  const [operationMode, setOperationMode] = useState<AgentMode>('full_auto')
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null)
  const [taskCategory, setTaskCategory] = useState('all')
  const [showTaskLibrary, setShowTaskLibrary] = useState(false)
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [useCustomPrompt, setUseCustomPrompt] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [authType, setAuthType] = useState<AuthTypeOption>('none')
  const [authValue, setAuthValue] = useState('')
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [maxDepth, setMaxDepth] = useState(5)
  const [isLoading, setIsLoading] = useState(false)

  const notify = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    notification[type]({ message })
  }, [notification])

  const loadTasks = useCallback(async (category?: string) => {
    setLoadingTasks(true)
    try {
      const taskList = await agentApi.tasks.list(category === 'all' ? undefined : category)
      setTasks(taskList)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setLoadingTasks(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const getTargetUrl = useCallback((): string => {
    if (targetMode === 'single') return singleUrl.trim()
    if (targetMode === 'multiple') return multipleUrls.split(/[,\n]/)[0]?.trim() || ''
    return uploadedUrls[0] || ''
  }, [targetMode, singleUrl, multipleUrls, uploadedUrls])

  const handleFileUpload = useCallback(async (file: File) => {
    try {
      const result = await targetsApi.upload(file)
      const validUrls = result
        .filter((item: { valid: boolean; normalized_url: string }) => item.valid)
        .map((item: { valid: boolean; normalized_url: string }) => item.normalized_url)
      setUploadedUrls(validUrls)
      setUrlError('')
      notify(t('newScan.validUrlsLoaded', { count: validUrls.length }), 'success')
    } catch (error) {
      setUrlError(t('newScan.failedToParseFile'))
      notify(t('newScan.failedToParseFile'), 'error')
    }
    return false
  }, [notify, t])

  const handleCategoryChange = useCallback((category: string) => {
    setTaskCategory(category)
    loadTasks(category)
  }, [loadTasks])

  const handleStartAgent = useCallback(async () => {
    const target = getTargetUrl()
    if (!target) {
      setUrlError(t('newScan.pleaseEnterTarget'))
      notify(t('newScan.pleaseEnterTargetBeforeDeploy'), 'warning')
      return
    }

    setIsLoading(true)
    try {
      const validation = await targetsApi.validateBulk([target])
      if (!validation[0]?.valid) {
        setUrlError(t('newScan.invalidUrl'))
        notify(t('newScan.invalidUrlCheck'), 'error')
        return
      }

      const request: AgentRequest = {
        target: validation[0].normalized_url,
        mode: operationMode,
        max_depth: maxDepth,
      }

      if (selectedTask && !useCustomPrompt) {
        request.task_id = selectedTask.id
      } else if (useCustomPrompt && customPrompt.trim()) {
        request.prompt = customPrompt
      }

      if (authType !== 'none' && authValue.trim()) {
        request.auth_type = authType as AgentRequest['auth_type']
        request.auth_value = authValue
      }

      const response = await agentApi.run(request)
      notify(t('newScan.agentDeployed'), 'success')
      setTimeout(() => navigate(`/agent/${response.agent_id}`), 300)
    } catch (error) {
      console.error('Failed to start agent:', error)
      setUrlError(t('newScan.failedToStartAgent'))
      notify(t('newScan.failedToStartAgentRetry'), 'error')
    } finally {
      setIsLoading(false)
    }
  }, [getTargetUrl, t, notify, operationMode, maxDepth, selectedTask, useCustomPrompt, customPrompt, authType, authValue, navigate])

  const filteredTasks = useMemo(() => {
    if (showTaskLibrary) return tasks
    return tasks.slice(0, 4)
  }, [tasks, showTaskLibrary])

  const currentModeInfo = operationModes.find(mode => mode.id === operationMode) ?? operationModes[0]

  return (
    <PageContainer
      title={t('newScan.title')}
      subTitle={t('newScan.subtitle')}
      extra={[
        <Button key="cancel" onClick={() => navigate('/')}>{t('common.cancel')}</Button>,
        <Button key="start" type="primary" icon={<PlayCircleOutlined />} loading={isLoading} onClick={handleStartAgent}>
          {t('newScan.deployAgent', { mode: currentModeInfo.name })}
        </Button>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ProCard title={t('newScan.operationMode')} subTitle={t('newScan.operationModeDesc')} bordered>
          <Radio.Group value={operationMode} onChange={event => setOperationMode(event.target.value)} style={{ width: '100%' }}>
            <Flex gap={16} wrap="wrap">
              {operationModes.map(mode => (
                <Radio.Button key={mode.id} value={mode.id} style={{ height: 'auto', padding: 0, borderRadius: 8 }}>
                  <Card
                    hoverable
                    style={{
                      width: 220,
                      borderColor: operationMode === mode.id ? mode.color : undefined,
                      background: operationMode === mode.id ? `${mode.color}12` : undefined,
                    }}
                    bodyStyle={{ padding: 16 }}
                  >
                    <Space direction="vertical" size={8}>
                      <Space>
                        <span style={{ color: mode.color, fontSize: 20 }}>{mode.icon}</span>
                        <Text strong>{mode.name}</Text>
                      </Space>
                      <Text type="secondary">{mode.description}</Text>
                      {mode.warning && operationMode === mode.id && (
                        <Alert type="warning" showIcon message={mode.warning} />
                      )}
                    </Space>
                  </Card>
                </Radio.Button>
              ))}
            </Flex>
          </Radio.Group>
        </ProCard>

        <ProCard title={t('newScan.target')} subTitle={t('newScan.targetDesc')} bordered>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Segmented<TargetInputMode>
              value={targetMode}
              onChange={value => {
                setTargetMode(value)
                setUrlError('')
              }}
              options={[
                { label: t('newScan.singleUrl'), value: 'single', icon: <ThunderboltOutlined /> },
                { label: t('newScan.multipleUrls'), value: 'multiple', icon: <FileTextOutlined /> },
                { label: t('newScan.uploadFile'), value: 'file', icon: <CloudUploadOutlined /> },
              ]}
            />

            {targetMode === 'single' && (
              <Input
                size="large"
                status={urlError ? 'error' : undefined}
                placeholder="https://example.com"
                value={singleUrl}
                onChange={event => {
                  setSingleUrl(event.target.value)
                  setUrlError('')
                }}
              />
            )}

            {targetMode === 'multiple' && (
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <TextArea
                  rows={5}
                  status={urlError ? 'error' : undefined}
                  placeholder={'Enter URLs separated by commas or new lines:\nhttps://example1.com\nhttps://example2.com'}
                  value={multipleUrls}
                  onChange={event => {
                    setMultipleUrls(event.target.value)
                    setUrlError('')
                  }}
                />
                <Text type="secondary">{t('newScan.multipleUrlsNote')}</Text>
              </Space>
            )}

            {targetMode === 'file' && (
              <Upload.Dragger accept=".txt,.csv,.lst" maxCount={1} beforeUpload={handleFileUpload} showUploadList={false}>
                <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
                <p className="ant-upload-text">{t('newScan.clickToUpload')}</p>
                <p className="ant-upload-hint">{t('newScan.supportedFormats')}</p>
                {uploadedUrls.length > 0 && <Tag color="green">{t('newScan.validUrlsLoaded', { count: uploadedUrls.length })}</Tag>}
              </Upload.Dragger>
            )}

            {urlError && <Alert type="error" showIcon message={urlError} />}
          </Space>
        </ProCard>

        <ProCard
          title={<Space><BookOutlined />{t('newScan.taskLibrary')}</Space>}
          subTitle={t('newScan.taskLibraryDesc')}
          extra={(
            <Button type="link" onClick={() => setShowTaskLibrary(prev => !prev)}>
              {showTaskLibrary ? t('common.collapse', 'Collapse') : t('newScan.showAllTasks', { count: tasks.length })}
            </Button>
          )}
          bordered
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Checkbox checked={useCustomPrompt} onChange={event => setUseCustomPrompt(event.target.checked)}>
              {t('newScan.useCustomPrompt')}
            </Checkbox>

            {useCustomPrompt ? (
              <TextArea
                rows={6}
                value={customPrompt}
                onChange={event => setCustomPrompt(event.target.value)}
                placeholder={'Enter your custom prompt for the AI agent...\n\nExample: Test for SQL injection on all form inputs, check for authentication bypass on the login endpoint, and look for IDOR vulnerabilities in user profile APIs.'}
              />
            ) : (
              <>
                {showTaskLibrary && (
                  <Segmented
                    value={taskCategory}
                    onChange={value => handleCategoryChange(String(value))}
                    options={taskCategories.map(category => ({ label: category.name, value: category.id }))}
                    style={{ maxWidth: '100%', overflowX: 'auto' }}
                  />
                )}

                <Spin spinning={loadingTasks}>
                  {filteredTasks.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('taskLibrary.noTasks', 'No tasks')} />
                  ) : (
                    <List
                      grid={{ gutter: 12, xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
                      dataSource={filteredTasks}
                      renderItem={task => (
                        <List.Item>
                          <Card
                            hoverable
                            onClick={() => {
                              setSelectedTask(task)
                              notify(t('newScan.taskSelected', { name: task.name }), 'info')
                            }}
                            style={{ borderColor: selectedTask?.id === task.id ? '#1677ff' : undefined }}
                          >
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                              <Flex justify="space-between" gap={8}>
                                <Text strong ellipsis>{task.name}</Text>
                                {task.is_preset && <Tag color="blue">{t('taskLibrary.preset')}</Tag>}
                              </Flex>
                              <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                                {task.description}
                              </Paragraph>
                              <Space wrap>
                                <Tag>{task.category}</Tag>
                                {task.estimated_tokens > 0 && <Tag>~{task.estimated_tokens} {t('taskLibrary.tokens')}</Tag>}
                                {task.tags?.slice(0, 3).map(tag => <Tag key={tag}>{tag}</Tag>)}
                              </Space>
                            </Space>
                          </Card>
                        </List.Item>
                      )}
                    />
                  )}
                </Spin>

                {!showTaskLibrary && tasks.length > 4 && (
                  <Button block onClick={() => setShowTaskLibrary(true)}>
                    {t('newScan.showAllTasks', { count: tasks.length })}
                  </Button>
                )}
              </>
            )}

            {selectedTask && !useCustomPrompt && (
              <Alert
                type="info"
                showIcon
                message={`${t('newScan.selected')}: ${selectedTask.name}`}
                description={<Paragraph ellipsis={{ rows: 4 }} style={{ marginBottom: 0 }}>{selectedTask.prompt}</Paragraph>}
                action={<Button size="small" onClick={() => setSelectedTask(null)}>{t('common.clear')}</Button>}
              />
            )}
          </Space>
        </ProCard>

        <ProCard title={<Space><KeyOutlined />{t('newScan.authentication')} <Tag>{t('newScan.optional')}</Tag></Space>} bordered>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Segmented
              value={authType}
              onChange={value => setAuthType(value as AuthTypeOption)}
              options={authTypeOptions.map(option => ({ label: option.label, value: option.id }))}
            />
            {authType !== 'none' && (
              <Input
                value={authValue}
                onChange={event => setAuthValue(event.target.value)}
                placeholder={authPlaceholder(authType)}
              />
            )}
          </Space>
        </ProCard>

        <Collapse
          activeKey={showAdvancedOptions ? ['advanced'] : []}
          onChange={keys => setShowAdvancedOptions(keys.includes('advanced'))}
          items={[
            {
              key: 'advanced',
              label: <Space><SettingOutlined />{t('newScan.advancedOptions')}</Space>,
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>{t('newScan.maxCrawlDepth')}</Text>
                  <Slider min={1} max={10} value={maxDepth} onChange={setMaxDepth} marks={{ 1: '1', 5: '5', 10: '10' }} />
                </Space>
              ),
            },
          ]}
        />

        {operationMode === 'prompt_only' && (
          <Alert
            type="warning"
            showIcon
            message={t('newScan.highTokenWarning')}
            description={t('newScan.highTokenWarningDesc')}
          />
        )}

        <ProCard bordered>
          <Flex justify="space-between" align="center" gap={16} wrap="wrap">
            <Space direction="vertical" size={2}>
              <Title level={5} style={{ margin: 0 }}>{currentModeInfo.name}</Title>
              <Text type="secondary">{currentModeInfo.description}</Text>
            </Space>
            <Space>
              <Button onClick={() => navigate('/')}>{t('common.cancel')}</Button>
              <Button type="primary" size="large" icon={<CheckCircleOutlined />} loading={isLoading} onClick={handleStartAgent}>
                {t('newScan.deployAgent', { mode: currentModeInfo.name })}
              </Button>
            </Space>
          </Flex>
        </ProCard>
      </Space>
    </PageContainer>
  )
}
