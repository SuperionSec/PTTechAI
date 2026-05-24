import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  AimOutlined,
  ApiOutlined,
  BugOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LockOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { agentApi, reportsApi } from '../services/api'
import type { AgentFinding, AgentLog, AgentStatus, ContainerStatus, ToolExecution } from '../types'
import { isLogContainerNearBottom } from '../utils/logScroll'

const { Text, Paragraph } = Typography

const SESSION_KEY = 'pttechai_fullia_session'
const POLL_INTERVAL = 1500
const POLL_INTERVAL_ERROR = 5000

interface ProviderModel {
  provider_id: string
  provider_name: string
  default_model: string
  tier: number
  available_models: string[]
}

function phaseFromProgress(progress: number): number {
  if (progress < 25) return 0
  if (progress < 70) return 1
  if (progress < 85) return 2
  return 3
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function matchLogFilter(log: AgentLog, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'llm') return log.message.startsWith('[LLM PENTEST]')
  if (filter === 'ai') return log.source === 'llm' || log.message.includes('[AI]') || log.message.includes('[LLM]')
  if (filter === 'error') return log.level === 'error' || log.level === 'warning'
  return true
}

function getSeverityColor(severity: string): string {
  const map: Record<string, string> = {
    critical: 'red',
    high: 'volcano',
    medium: 'orange',
    low: 'blue',
    info: 'default',
  }
  return map[severity] || 'default'
}

function getStatusBadge(status?: string): 'processing' | 'success' | 'error' | 'warning' | 'default' {
  if (status === 'running' || status === 'paused') return 'processing'
  if (status === 'completed') return 'success'
  if (status === 'error') return 'error'
  if (status === 'stopped') return 'warning'
  return 'default'
}

function getConfidenceDisplay(finding: { confidence_score?: number; confidence?: string }, t: (key: string) => string) {
  let score: number | null = null
  if (typeof finding.confidence_score === 'number') {
    score = finding.confidence_score
  } else if (finding.confidence) {
    const parsed = Number(finding.confidence)
    if (!Number.isNaN(parsed)) score = parsed
    else score = { high: 90, medium: 60, low: 30 }[finding.confidence.toLowerCase()] ?? null
  }
  if (score === null) return null
  return {
    score,
    color: score >= 90 ? 'green' : score >= 60 ? 'gold' : 'red',
    label: score >= 90 ? t('fullIaTesting.confirmed') : score >= 60 ? t('fullIaTesting.likely') : t('fullIaTesting.low'),
  }
}

function LogViewer({ logs, logFilter, setLogFilter, logSearch, setLogSearch, t }: {
  logs: AgentLog[]
  logFilter: string
  setLogFilter: (value: string) => void
  logSearch: string
  setLogSearch: (value: string) => void
  t: (key: string) => string
}) {
  const logScrollRef = useRef<HTMLDivElement>(null)
  const [followLatest, setFollowLatest] = useState(true)
  const filteredLogs = useMemo(() => logs.filter(log => {
    if (!matchLogFilter(log, logFilter)) return false
    if (logSearch && !log.message.toLowerCase().includes(logSearch.toLowerCase())) return false
    return true
  }), [logFilter, logSearch, logs])

  useEffect(() => {
    if (!followLatest) return
    const el = logScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [filteredLogs.length, followLatest])

  return (
    <Card size="small">
      <Space wrap style={{ marginBottom: 12 }}>
        <Radio.Group size="small" value={logFilter} onChange={event => setLogFilter(event.target.value)}>
          <Radio.Button value="all">{t('fullIaTesting.all')}</Radio.Button>
          <Radio.Button value="llm">{t('fullIaTesting.llmPentest')}</Radio.Button>
          <Radio.Button value="ai">{t('fullIaTesting.aiDecisions')}</Radio.Button>
          <Radio.Button value="error">{t('fullIaTesting.errors')}</Radio.Button>
        </Radio.Group>
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined />}
          value={logSearch}
          onChange={event => setLogSearch(event.target.value)}
          placeholder={t('fullIaTesting.search')}
          style={{ width: 220 }}
        />
        <Checkbox checked={followLatest} onChange={event => setFollowLatest(event.target.checked)}>
          {t('autoPentest.followLatestLogs')}
        </Checkbox>
        <Text type="secondary">{filteredLogs.length}/{logs.length}</Text>
      </Space>
      <div
        ref={logScrollRef}
        onScroll={() => {
          const el = logScrollRef.current
          if (el && followLatest && !isLogContainerNearBottom(el)) setFollowLatest(false)
        }}
        style={{ maxHeight: 420, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12 }}
      >
        {filteredLogs.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={logs.length === 0 ? t('fullIaTesting.waitingForLogs') : t('fullIaTesting.noLogsMatch')} />
        ) : filteredLogs.map((log, index) => (
          <div key={`${log.time}-${index}`} style={{ display: 'flex', gap: 8, padding: '2px 4px' }}>
            <Text type="secondary" style={{ minWidth: 68, fontSize: 12 }}>{log.time?.slice(11, 19) || ''}</Text>
            <Tag color={log.level === 'error' ? 'red' : log.level === 'warning' ? 'orange' : log.level === 'success' ? 'green' : 'blue'} style={{ marginInlineEnd: 0 }}>
              {log.level}
            </Tag>
            <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.message}</Text>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ToolExecutionsPanel({ toolExecutions, containerStatus, expandedTool, setExpandedTool, isRunning, t }: {
  toolExecutions: ToolExecution[]
  containerStatus?: ContainerStatus
  expandedTool: string | null
  setExpandedTool: (id: string | null) => void
  isRunning: boolean
  t: (key: string) => string
}) {
  return (
    <ProCard
      title={t('fullIaTesting.containerTelemetry')}
      extra={containerStatus ? (
        <Space>
          <Badge status={containerStatus.online ? 'success' : 'error'} text={containerStatus.online ? t('fullIaTesting.online') : t('fullIaTesting.offline')} />
          {containerStatus.container_id && <Text type="secondary">{containerStatus.container_id.slice(0, 12)}</Text>}
        </Space>
      ) : null}
      style={{ marginBottom: 16 }}
    >
      {toolExecutions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={isRunning ? t('fullIaTesting.waitingForToolExec') : t('fullIaTesting.noToolExecutions')} />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          {toolExecutions.map((exec, index) => {
            const key = exec.task_id || String(index)
            const expanded = expandedTool === key
            return (
              <Card size="small" key={key}>
                <Row gutter={[8, 8]} align="middle">
                  <Col xs={24} md={3}><Text type="secondary">{exec.task_id?.slice(0, 8) || '---'}</Text></Col>
                  <Col xs={24} md={4}><Tag color="cyan">{exec.tool}</Tag></Col>
                  <Col xs={24} md={10}><Text ellipsis title={exec.command}>{exec.command}</Text></Col>
                  <Col xs={8} md={2}><Tag color={exec.exit_code === 0 ? 'green' : exec.exit_code == null ? 'default' : 'red'}>{exec.exit_code ?? '...'}</Tag></Col>
                  <Col xs={8} md={2}><Text>{exec.duration != null ? `${exec.duration.toFixed(1)}s` : '-'}</Text></Col>
                  <Col xs={8} md={2}><Text>{exec.findings_count ?? 0}</Text></Col>
                  <Col xs={24} md={1}>
                    {(exec.stdout_preview || exec.stderr_preview || exec.reason) && (
                      <Button size="small" type="link" onClick={() => setExpandedTool(expanded ? null : key)}>
                        {expanded ? t('common.collapse') : t('fullIaTesting.view')}
                      </Button>
                    )}
                  </Col>
                </Row>
                {expanded && (
                  <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
                    {exec.reason && <Alert type="info" message={exec.reason} />}
                    {exec.stdout_preview && <pre style={{ maxHeight: 220, overflow: 'auto', background: '#001529', color: '#b7eb8f', padding: 12, borderRadius: 6 }}>{exec.stdout_preview}</pre>}
                    {exec.stderr_preview && <pre style={{ maxHeight: 220, overflow: 'auto', background: '#2a1215', color: '#ffa39e', padding: 12, borderRadius: 6 }}>{exec.stderr_preview}</pre>}
                  </Space>
                )}
              </Card>
            )
          })}
        </Space>
      )}
    </ProCard>
  )
}

function FindingCard({ finding, expanded, isNew, onToggle, t }: {
  finding: AgentFinding
  expanded: boolean
  isNew: boolean
  onToggle: () => void
  t: (key: string) => string
}) {
  const confidence = getConfidenceDisplay(finding, t)
  return (
    <Card
      size="small"
      style={{ marginBottom: 8, borderColor: isNew ? '#ff4d4f' : undefined, opacity: finding.ai_status === 'rejected' ? 0.72 : 1 }}
      title={(
        <Space wrap>
          <Tag color={getSeverityColor(finding.severity)}>{t(`severity.${finding.severity}`)}</Tag>
          <Text strong>{finding.title}</Text>
          {finding.ai_status === 'rejected' && <Tag color="orange">{t('fullIaTesting.rejected')}</Tag>}
          {confidence && <Tag color={confidence.color}>{confidence.score}/100 {confidence.label}</Tag>}
        </Space>
      )}
      extra={<Button size="small" type="link" onClick={onToggle}>{expanded ? t('common.collapse') : t('fullIaTesting.view')}</Button>}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Row gutter={[12, 8]}>
          {finding.affected_endpoint && <Col xs={24} md={12}><Text type="secondary">{t('fullIaTesting.endpoint')}: </Text><Text copyable>{finding.affected_endpoint}</Text></Col>}
          {finding.parameter && <Col xs={24} md={12}><Text type="secondary">{t('fullIaTesting.parameter')}: </Text><Text>{finding.parameter}</Text></Col>}
          {finding.cwe_id && <Col xs={12} md={6}><Text type="secondary">{t('fullIaTesting.cwe')}: </Text><Text>{finding.cwe_id}</Text></Col>}
          {finding.cvss_score > 0 && <Col xs={12} md={6}><Text type="secondary">{t('fullIaTesting.cvss')}: </Text><Text>{finding.cvss_score}</Text></Col>}
          <Col xs={12} md={6}><Text type="secondary">{finding.vulnerability_type}</Text></Col>
        </Row>
        {finding.description && <Paragraph ellipsis={expanded ? false : { rows: 2 }}>{finding.description}</Paragraph>}
        {expanded && (
          <Collapse size="small" items={[
            finding.payload ? { key: 'payload', label: t('fullIaTesting.payload'), children: <pre style={{ whiteSpace: 'pre-wrap' }}>{finding.payload}</pre> } : null,
            finding.evidence ? { key: 'evidence', label: t('fullIaTesting.evidence'), children: <pre style={{ whiteSpace: 'pre-wrap' }}>{finding.evidence}</pre> } : null,
            finding.poc_code ? { key: 'poc', label: t('fullIaTesting.pocCode'), children: <pre style={{ whiteSpace: 'pre-wrap' }}>{finding.poc_code}</pre> } : null,
            finding.rejection_reason ? { key: 'rejection', label: t('fullIaTesting.rejection'), children: <Alert type="warning" message={finding.rejection_reason} /> } : null,
            finding.confidence_breakdown ? { key: 'confidence', label: t('fullIaTesting.confidence'), children: (
              <Descriptions size="small" bordered column={2}>
                {Object.entries(finding.confidence_breakdown).map(([key, value]) => <Descriptions.Item key={key} label={key.replace(/_/g, ' ')}>{value}</Descriptions.Item>)}
              </Descriptions>
            ) } : null,
          ].filter(Boolean) as Array<{ key: string; label: string; children: React.ReactNode }>} />
        )}
      </Space>
    </Card>
  )
}

export default function FullIATestingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { notification } = AntApp.useApp()
  const [form] = Form.useForm()

  const [target, setTarget] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [authType, setAuthType] = useState('')
  const [authValue, setAuthValue] = useState('')
  const [availableModels, setAvailableModels] = useState<ProviderModel[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [promptContent, setPromptContent] = useState<string | null>(null)
  const [promptLoading, setPromptLoading] = useState(true)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [showPromptPreview, setShowPromptPreview] = useState(false)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [error, setError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [activeTab, setActiveTab] = useState<'findings' | 'logs'>('findings')
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null)
  const [expandedTool, setExpandedTool] = useState<string | null>(null)
  const [findingsFilter, setFindingsFilter] = useState<'confirmed' | 'rejected' | 'all'>('all')
  const [logFilter, setLogFilter] = useState('all')
  const [logSearch, setLogSearch] = useState('')
  const [newFindingIds, setNewFindingIds] = useState<Set<string>>(new Set())
  const [connectionLost, setConnectionLost] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const seenFindingIdsRef = useRef<Set<string>>(new Set())
  const prevPhaseRef = useRef<string | null>(null)
  const prevStatusRef = useRef<string | null>(null)
  const consecutiveErrorsRef = useRef(0)
  const newFindingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    notification[type]({ message })
  }, [notification])

  useEffect(() => {
    fetch('/api/v1/full-ia/prompt')
      .then(response => response.json())
      .then(data => {
        setPromptContent(data.content)
        setPromptLoading(false)
      })
      .catch(() => {
        setPromptError(t('fullIaTesting.failedToLoadPrompt'))
        setPromptLoading(false)
      })

    fetch('/api/v1/providers/available-models')
      .then(response => response.json())
      .then(data => setAvailableModels(data.models || []))
      .catch(() => {})

    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) {
        const session = JSON.parse(saved) as { agentId: string; target: string; status: string }
        setAgentId(session.agentId)
        setTarget(session.target || '')
        form.setFieldValue('target', session.target || '')
        setIsRunning(session.status === 'running')
      }
    } catch { /* ignore */ }
  }, [form, t])

  useEffect(() => {
    if (!status?.started_at) return
    const startTime = new Date(status.started_at).getTime()
    if (isRunning) {
      const tick = () => setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))
      tick()
      const id = window.setInterval(tick, 1000)
      return () => window.clearInterval(id)
    }
    const endTime = status.completed_at ? new Date(status.completed_at).getTime() : Date.now()
    setElapsedSeconds(Math.max(0, Math.floor((endTime - startTime) / 1000)))
  }, [isRunning, status?.completed_at, status?.started_at])

  useEffect(() => {
    if (!agentId) return

    const poll = async () => {
      try {
        const agentStatus = await agentApi.getStatus(agentId)
        consecutiveErrorsRef.current = 0
        if (connectionLost) setConnectionLost(false)
        setStatus(agentStatus)
        const running = agentStatus.status === 'running' || agentStatus.status === 'paused'
        setIsRunning(running)
        try {
          const saved = localStorage.getItem(SESSION_KEY)
          if (saved) {
            const session = JSON.parse(saved) as Record<string, unknown>
            session.status = agentStatus.status
            localStorage.setItem(SESSION_KEY, JSON.stringify(session))
          }
        } catch { /* ignore */ }

        if (prevPhaseRef.current && agentStatus.phase && agentStatus.phase !== prevPhaseRef.current) {
          notify(`${t('fullIaTesting.phase')}: ${agentStatus.phase}`, 'info')
        }
        prevPhaseRef.current = agentStatus.phase || null

        if (prevStatusRef.current === 'running' && agentStatus.status === 'completed') notify(t('fullIaTesting.pentestComplete', { count: agentStatus.findings_count }), 'success')
        if (prevStatusRef.current === 'running' && agentStatus.status === 'error') notify(t('fullIaTesting.pentestFailed'), 'error')
        if (prevStatusRef.current === 'running' && agentStatus.status === 'stopped') notify(t('fullIaTesting.pentestStopped'), 'info')
        prevStatusRef.current = agentStatus.status

        const currentIds = new Set((agentStatus.findings || []).map((finding: AgentFinding) => finding.id))
        if (seenFindingIdsRef.current.size > 0) {
          const newIds = [...currentIds].filter(id => !seenFindingIdsRef.current.has(id))
          if (newIds.length > 0) {
            newIds.forEach(id => {
              const finding = agentStatus.findings?.find((item: AgentFinding) => item.id === id)
              if (finding) notify(`${t(`severity.${finding.severity}`)}: ${finding.title}`, finding.severity === 'critical' || finding.severity === 'high' ? 'warning' : 'info')
            })
            setNewFindingIds(new Set(newIds))
            if (newFindingTimerRef.current) window.clearTimeout(newFindingTimerRef.current)
            newFindingTimerRef.current = window.setTimeout(() => setNewFindingIds(new Set()), 3000)
          }
        }
        seenFindingIdsRef.current = currentIds
      } catch {
        consecutiveErrorsRef.current += 1
        if (consecutiveErrorsRef.current >= 3) setConnectionLost(true)
      }

      try {
        const logData = await agentApi.getLogs(agentId, 300)
        setLogs(logData.logs || [])
      } catch { /* ignore */ }
    }

    poll()
    pollRef.current = window.setInterval(poll, consecutiveErrorsRef.current >= 3 ? POLL_INTERVAL_ERROR : POLL_INTERVAL)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [agentId, connectionLost, notify, t])

  const handleStart = async () => {
    const primaryTarget = target.trim()
    if (!primaryTarget || !promptContent) return
    setError(null)
    setLogs([])
    setReportId(null)
    seenFindingIdsRef.current = new Set()
    prevPhaseRef.current = null
    prevStatusRef.current = null
    consecutiveErrorsRef.current = 0

    try {
      const response = await agentApi.autoPentest(primaryTarget, {
        mode: 'full_llm_pentest',
        prompt: promptContent,
        enable_kali_sandbox: false,
        auth_type: authType || undefined,
        auth_value: authValue || undefined,
        preferred_provider: selectedProvider || undefined,
        preferred_model: selectedModel || undefined,
      })
      setAgentId(response.agent_id)
      setIsRunning(true)
      notify(t('fullIaTesting.pentestStarted'), 'info')
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        agentId: response.agent_id,
        target: primaryTarget,
        startedAt: new Date().toISOString(),
        status: 'running',
      }))
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { detail?: string } }; message?: string }
      setError(errorResponse.response?.data?.detail || errorResponse.message || t('fullIaTesting.failedToStart'))
    }
  }

  const handleStop = async () => {
    if (!agentId) return
    await agentApi.stop(agentId).catch(() => {})
    setIsRunning(false)
  }

  const handleClear = () => {
    setAgentId(null)
    setStatus(null)
    setIsRunning(false)
    setLogs([])
    setError(null)
    setReportId(null)
    setElapsedSeconds(0)
    setActiveTab('findings')
    setNewFindingIds(new Set())
    setConnectionLost(false)
    seenFindingIdsRef.current = new Set()
    prevPhaseRef.current = null
    prevStatusRef.current = null
    localStorage.removeItem(SESSION_KEY)
  }

  const handleGenerateAiReport = useCallback(async () => {
    if (!status?.scan_id) return
    setGeneratingReport(true)
    try {
      const report = await reportsApi.generateAiReport({
        scan_id: status.scan_id,
        title: `FULL AI Report - ${target}`,
        preferred_provider: selectedProvider || undefined,
        preferred_model: selectedModel || undefined,
      })
      setReportId(report.id)
      notify(t('fullIaTesting.aiReportGenerated'), 'success')
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('fullIaTesting.failedToGenerateReport'))
    } finally {
      setGeneratingReport(false)
    }
  }, [notify, selectedModel, selectedProvider, status?.scan_id, t, target])

  const currentPhaseIdx = status ? phaseFromProgress(status.progress) : -1
  const findings = status?.findings || []
  const rejectedFindings = status?.rejected_findings || []
  const allFindings = useMemo(() => [...findings, ...rejectedFindings], [findings, rejectedFindings])
  const displayFindings = findingsFilter === 'confirmed' ? findings : findingsFilter === 'rejected' ? rejectedFindings : allFindings
  const sevCounts = useMemo(() => findings.reduce((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] || 0) + 1
    return acc
  }, {} as Record<string, number>), [findings])
  const toolExecutions: ToolExecution[] = status?.tool_executions || []
  const containerStatus: ContainerStatus | undefined = status?.container_status

  return (
    <PageContainer
      title={t('fullIaTesting.title')}
      subTitle={t('fullIaTesting.subtitle')}
      extra={promptContent ? [
        <Button key="prompt" icon={<FileTextOutlined />} onClick={() => setShowPromptPreview(true)}>
          {t('fullIaTesting.viewPrompt')} ({promptContent.split('\n').length} {t('fullIaTesting.lines')})
        </Button>,
      ] : []}
    >
      {connectionLost && <Alert type="warning" showIcon icon={<ExclamationCircleOutlined />} message={t('fullIaTesting.connectionIssues')} style={{ marginBottom: 16 }} />}
      {promptLoading && <Alert type="info" showIcon message={t('fullIaTesting.loadingPrompt')} style={{ marginBottom: 16 }} />}
      {promptError && <Alert type="error" showIcon message={promptError} style={{ marginBottom: 16 }} />}
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16 }} />}

      {!agentId && (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <ProCard title={t('fullIaTesting.startFullLlmPentest')}>
              <Form form={form} layout="vertical" onFinish={handleStart} initialValues={{ target }}>
                <Form.Item label={t('fullIaTesting.targetUrl')} name="target" rules={[{ required: true, message: t('fullIaTesting.targetUrl') }]}>
                  <Input size="large" prefix={<GlobalOutlined />} placeholder={t('fullIaTesting.targetPlaceholder')} value={target} onChange={event => setTarget(event.target.value)} />
                </Form.Item>

                <Space wrap style={{ marginBottom: 16 }}>
                  <Tag color="red" icon={<RobotOutlined />}>{t('fullIaTesting.llmDrivenPentest')}</Tag>
                  <Tag color="purple" icon={<AimOutlined />}>{t('fullIaTesting.aiPlansExecutes')}</Tag>
                  <Tag color="orange" icon={<SafetyCertificateOutlined />}>{t('fullIaTesting.fullValidation')}</Tag>
                </Space>

                {availableModels.length > 0 && (
                  <Row gutter={12}>
                    <Col xs={24} md={12}>
                      <Form.Item label={t('fullIaTesting.llmProvider')}>
                        <Select
                          allowClear
                          value={selectedProvider || undefined}
                          onChange={value => {
                            setSelectedProvider(value || '')
                            const model = availableModels.find(item => item.provider_id === value)
                            setSelectedModel(model?.default_model || '')
                          }}
                          placeholder={t('fullIaTesting.autoBest')}
                          options={availableModels.map(model => ({ value: model.provider_id, label: `${model.provider_name} (Tier ${model.tier})` }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label={t('fullIaTesting.model')}>
                        <Select
                          allowClear
                          showSearch
                          value={selectedModel || undefined}
                          onChange={value => setSelectedModel(value || '')}
                          placeholder={t('fullIaTesting.autoDefault')}
                          options={(selectedProvider ? availableModels.find(model => model.provider_id === selectedProvider)?.available_models || [] : [...new Set(availableModels.flatMap(model => model.available_models))]).map(model => ({ value: model, label: model }))}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}

                <Collapse ghost items={[{
                  key: 'auth',
                  label: <Space><LockOutlined />{t('fullIaTesting.authentication')}<Switch size="small" checked={showAuth} onChange={setShowAuth} /></Space>,
                  children: showAuth ? (
                    <Row gutter={12}>
                      <Col xs={24} md={8}>
                        <Select
                          allowClear
                          style={{ width: '100%' }}
                          value={authType || undefined}
                          onChange={value => setAuthType(value || '')}
                          placeholder={t('fullIaTesting.noAuth')}
                          options={[
                            { value: 'bearer', label: t('fullIaTesting.bearerToken') },
                            { value: 'cookie', label: t('fullIaTesting.cookie') },
                            { value: 'basic', label: t('fullIaTesting.basicAuth') },
                            { value: 'header', label: t('fullIaTesting.customHeader') },
                          ]}
                        />
                      </Col>
                      <Col xs={24} md={16}>
                        <Input value={authValue} onChange={event => setAuthValue(event.target.value)} placeholder={authType === 'cookie' ? 'session=abc123; token=xyz' : authType === 'basic' ? 'admin:password123' : authType === 'header' ? 'X-API-Key:your-api-key' : 'eyJhbGciOiJIUzI1NiIs...'} />
                      </Col>
                    </Row>
                  ) : null,
                }]} />

                <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
                  <Button block size="large" type="primary" danger htmlType="submit" icon={<RobotOutlined />} disabled={!target.trim() || !promptContent || promptLoading}>
                    {t('fullIaTesting.startFullLlmPentest')}
                  </Button>
                </Form.Item>
              </Form>
            </ProCard>
          </Col>
          <Col xs={24} lg={8}>
            <ProCard title={t('fullIaTesting.methodologyPrompt')}>
              <StatisticCard.Group direction="column">
                <StatisticCard statistic={{ title: t('fullIaTesting.lines'), value: promptContent?.split('\n').length || 0, icon: <FileTextOutlined /> }} />
                <StatisticCard statistic={{ title: t('fullIaTesting.llmProvider'), value: availableModels.length, icon: <RobotOutlined /> }} />
              </StatisticCard.Group>
              <Button block style={{ marginTop: 12 }} icon={<FileTextOutlined />} disabled={!promptContent} onClick={() => setShowPromptPreview(true)}>
                {t('fullIaTesting.viewPrompt')}
              </Button>
            </ProCard>
          </Col>
        </Row>
      )}

      {agentId && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <ProCard>
            <Row gutter={[16, 16]} align="middle">
              <Col flex="auto">
                <Space wrap>
                  <Badge status={getStatusBadge(status?.status)} />
                  <Text strong>{isRunning ? t('fullIaTesting.pentestRunning') : status?.status === 'completed' ? t('fullIaTesting.pentestCompleteTitle') : status?.status === 'error' ? t('fullIaTesting.pentestFailedTitle') : t('fullIaTesting.pentestStoppedTitle')}</Text>
                  <Text type="secondary">{target}</Text>
                  {status?.scan_id && <Tag color="blue">{status.scan_id}</Tag>}
                </Space>
              </Col>
              <Col>
                <Space wrap>
                  {isRunning ? (
                    <Popconfirm title={t('common.stop')} onConfirm={handleStop}>
                      <Button danger icon={<CloseCircleOutlined />}>{t('common.stop')}</Button>
                    </Popconfirm>
                  ) : (
                    <>
                      <Button icon={<AimOutlined />} onClick={handleClear}>{t('fullIaTesting.newTest')}</Button>
                      <Button icon={<DeleteOutlined />} onClick={handleClear}>{t('common.clear')}</Button>
                    </>
                  )}
                </Space>
              </Col>
            </Row>
          </ProCard>

          {status && (
            <StatisticCard.Group>
              <StatisticCard statistic={{ title: t('fullIaTesting.elapsed'), value: formatElapsed(elapsedSeconds), icon: <ClockCircleOutlined /> }} />
              <StatisticCard statistic={{ title: t('fullIaTesting.findings'), value: status.findings_count, suffix: (status.rejected_findings_count ?? 0) > 0 ? `+${status.rejected_findings_count} ${t('fullIaTesting.rej')}` : undefined, icon: <BugOutlined /> }} />
              <StatisticCard statistic={{ title: t('fullIaTesting.toolsRun'), value: toolExecutions.length, icon: <ToolOutlined /> }} />
              <StatisticCard statistic={{ title: t('fullIaTesting.progress'), value: status.progress, suffix: '%', icon: <PlayCircleOutlined /> }} />
            </StatisticCard.Group>
          )}

          {status && (
            <ProCard title={status.phase || t('fullIaTesting.initializing')} extra={<Text>{status.progress}%</Text>}>
              <Progress percent={status.progress} status={isRunning ? 'active' : status.status === 'error' ? 'exception' : 'normal'} strokeColor="#ff4d4f" />
              <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
                {[
                  { key: 'recon', label: t('fullIaTesting.aiRecon'), icon: <ApiOutlined />, range: '0-25%' },
                  { key: 'testing', label: t('fullIaTesting.aiTesting'), icon: <BugOutlined />, range: '25-70%' },
                  { key: 'postexploit', label: t('fullIaTesting.postExploitation'), icon: <ExperimentOutlined />, range: '70-85%' },
                  { key: 'report', label: t('fullIaTesting.report'), icon: <SafetyCertificateOutlined />, range: '85-100%' },
                ].map((phase, index) => (
                  <Col xs={24} md={6} key={phase.key}>
                    <Card size="small" style={{ borderColor: index === currentPhaseIdx && isRunning ? '#ff4d4f' : undefined }}>
                      <Space>
                        {index < currentPhaseIdx || status.status === 'completed' || status.status === 'stopped' ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : phase.icon}
                        <Text>{phase.label}</Text>
                        <Text type="secondary">{phase.range}</Text>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            </ProCard>
          )}

          <ToolExecutionsPanel
            toolExecutions={toolExecutions}
            containerStatus={containerStatus}
            expandedTool={expandedTool}
            setExpandedTool={setExpandedTool}
            isRunning={isRunning}
            t={t}
          />

          <ProCard>
            <Tabs
              activeKey={activeTab}
              onChange={key => setActiveTab(key as 'findings' | 'logs')}
              items={[
                {
                  key: 'findings',
                  label: `${t('fullIaTesting.findings')} (${displayFindings.length})`,
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {allFindings.length > 0 && rejectedFindings.length > 0 && (
                        <Radio.Group value={findingsFilter} onChange={event => setFindingsFilter(event.target.value)}>
                          <Radio.Button value="all">{t('fullIaTesting.all')} ({allFindings.length})</Radio.Button>
                          <Radio.Button value="confirmed">{t('fullIaTesting.confirmed')} ({findings.length})</Radio.Button>
                          <Radio.Button value="rejected">{t('fullIaTesting.rejected')} ({rejectedFindings.length})</Radio.Button>
                        </Radio.Group>
                      )}
                      {Object.keys(sevCounts).length > 0 && (
                        <Space wrap>
                          {Object.entries(sevCounts).map(([severity, count]) => <Tag key={severity} color={getSeverityColor(severity)}>{severity}: {count}</Tag>)}
                        </Space>
                      )}
                      {displayFindings.length === 0 ? (
                        <Empty description={isRunning ? t('fullIaTesting.pentestInProgress') : t('fullIaTesting.noFindings')} />
                      ) : displayFindings.map(finding => (
                        <FindingCard
                          key={finding.id}
                          finding={finding}
                          expanded={expandedFinding === finding.id}
                          isNew={newFindingIds.has(finding.id)}
                          onToggle={() => setExpandedFinding(expandedFinding === finding.id ? null : finding.id)}
                          t={t}
                        />
                      ))}
                    </Space>
                  ),
                },
                {
                  key: 'logs',
                  label: `${t('fullIaTesting.log')} (${logs.length})`,
                  children: <LogViewer logs={logs} logFilter={logFilter} setLogFilter={setLogFilter} logSearch={logSearch} setLogSearch={setLogSearch} t={t} />,
                },
              ]}
            />
          </ProCard>

          {(status?.status === 'completed' || status?.status === 'stopped') && (
            <Alert
              type={status.status === 'completed' ? 'success' : 'warning'}
              showIcon
              message={status.status === 'completed' ? t('fullIaTesting.pentestCompleteTitle') : t('fullIaTesting.pentestStoppedTitle')}
              description={status.status === 'completed'
                ? t('fullIaTesting.foundVulnerabilities', { count: findings.length, target })
                : t('fullIaTesting.stoppedAt', { progress: status.progress, count: findings.length })}
              action={(
                <Space wrap>
                  <Button type="primary" icon={<ReloadOutlined />} onClick={() => navigate(`/agent/${agentId}`)}>{t('fullIaTesting.viewFullResults')}</Button>
                  {!reportId ? (
                    <Tooltip title={selectedProvider ? `Using: ${selectedProvider}/${selectedModel || 'auto'}` : 'Using: auto'}>
                      <Button loading={generatingReport} disabled={!status.scan_id} icon={<RobotOutlined />} onClick={handleGenerateAiReport}>{t('fullIaTesting.generateAiReport')}</Button>
                    </Tooltip>
                  ) : (
                    <>
                      <Button icon={<FileTextOutlined />} href={reportsApi.getViewUrl(reportId)} target="_blank">{t('fullIaTesting.viewReport')}</Button>
                      <Button icon={<DownloadOutlined />} href={reportsApi.getDownloadZipUrl(reportId)}>{t('fullIaTesting.downloadZip')}</Button>
                    </>
                  )}
                </Space>
              )}
            />
          )}

          {status?.status === 'error' && (
            <Alert type="error" showIcon message={t('fullIaTesting.pentestFailedTitle')} description={status.error || t('fullIaTesting.unexpectedError')} />
          )}
        </Space>
      )}

      <Modal
        width={900}
        open={showPromptPreview}
        title={t('fullIaTesting.methodologyPrompt')}
        footer={<Button onClick={() => setShowPromptPreview(false)}>{t('common.close')}</Button>}
        onCancel={() => setShowPromptPreview(false)}
      >
        <pre style={{ maxHeight: 560, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12 }}>{promptContent}</pre>
      </Modal>
    </PageContainer>
  )
}
