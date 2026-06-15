import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Empty,
  Input,
  List,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  BugOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DownloadOutlined,
  DownOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LinkOutlined,
  MinusOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ProfileOutlined,
  ReloadOutlined,
  RightOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  StopOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { scansApi, reportsApi, agentTasksApi, agentApi, vulnerabilitiesApi, providersApi } from '../services/api'
import { wsService } from '../services/websocket'
import { isLogContainerNearBottom } from '../utils/logScroll'
import { useScanStore } from '../store'
import { usePermission } from '../hooks/usePermission'
import type { Endpoint, Vulnerability, WSMessage, ScanAgentTask, Report, AgentStatus, AgentFinding, AgentLog, ToolExecution, ContainerStatus } from '../types'

const POLL_INTERVAL = 4000
const POLL_INTERVAL_ERROR = 8000
const TOAST_DURATION = 5000
const MAX_TOASTS = 5
const { Text, Paragraph } = Typography
const { TextArea } = Input

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'red',
  high: 'volcano',
  medium: 'gold',
  low: 'blue',
  info: 'default',
}

const STATUS_COLORS: Record<string, string> = {
  running: 'processing',
  paused: 'warning',
  completed: 'success',
  stopped: 'default',
  failed: 'error',
  pending: 'default',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  green: 'success',
  yellow: 'warning',
  red: 'error',
}

interface Toast {
  id: string
  message: string
  severity: string
  timestamp: number
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getConfidenceDisplay(finding: { confidence_score?: number; confidence?: string }, t?: (key: string) => string): { score: number; color: string; label: string } | null {
  let score: number | null = null

  if (typeof finding.confidence_score === 'number') {
    score = finding.confidence_score
  } else if (finding.confidence) {
    const parsed = Number(finding.confidence)
    if (!isNaN(parsed)) {
      score = parsed
    } else {
      const map: Record<string, number> = { high: 90, medium: 60, low: 30 }
      score = map[finding.confidence.toLowerCase()] ?? null
    }
  }

  if (score === null || score === undefined) {
    return { score: 0, color: 'red', label: t ? t('scanDetails.unknown') : 'Unknown' }
  }

  const color = score >= 90 ? 'green' : score >= 60 ? 'yellow' : 'red'
  const label = score >= 90 ? (t ? t('scanDetails.confirmedStatus') : 'Confirmed') : score >= 60 ? (t ? t('scanDetails.likely') : 'Likely') : score > 0 ? (t ? t('scanDetails.lowConfidence') : 'Low') : (t ? t('scanDetails.rejected') : 'Rejected')
  return { score, color, label }
}

function matchLogFilter(log: AgentLog, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'stream1') return log.message.startsWith('[STREAM 1]')
  if (filter === 'stream2') return log.message.startsWith('[STREAM 2]')
  if (filter === 'stream3') return log.message.startsWith('[STREAM 3]')
  if (filter === 'deep') return log.message.startsWith('[DEEP]')
  if (filter === 'error') return log.level === 'error' || log.level === 'warning'
  return true
}

function getLogMessageColor(message: string): string | undefined {
  if (message.startsWith('[STREAM 1]')) return '#60a5fa'
  if (message.startsWith('[STREAM 2]')) return '#c084fc'
  if (message.startsWith('[STREAM 3]')) return '#fb923c'
  if (message.startsWith('[TOOL]')) return '#fdba74'
  if (message.startsWith('[DEEP]')) return '#22d3ee'
  if (message.startsWith('[FINAL]')) return '#4ade80'
  if (message.startsWith('[CONTAINER]')) return '#67e8f9'
  if (message.startsWith('[CLI-AGENT]')) return '#f472b6'
  if (message.startsWith('[PHASE]')) return '#facc15'
  if (message.startsWith('[PHASE FAIL]')) return '#f87171'
  if (message.startsWith('[BANNER]')) return '#2dd4bf'
  if (message.startsWith('[WAF]')) return '#fbbf24'
  if (message.startsWith('[PLAYBOOK]')) return '#818cf8'
  if (message.startsWith('[SITE ANALYZER]')) return '#34d399'
  if (message.startsWith('[MD-AGENTS]')) return '#67e8f9'
  if (message.startsWith('[AGENT GRID]')) return '#4ade80'
  if (message.startsWith('[PHASE 1]')) return '#93c5fd'
  if (message.startsWith('[PHASE 2]')) return '#d8b4fe'
  if (message.startsWith('[PHASE 3]')) return '#fde047'
  if (message.startsWith('[RECON]')) return '#60a5fa'
  if (message.startsWith('[CVE]')) return '#fca5a5'
  if (message.startsWith('[CHAIN]')) return '#fdba74'
  if (message.startsWith('[JUDGE]')) return '#fcd34d'
  if (message.includes('Starting (real HTTP)')) return '#86efac'
  return undefined
}

function mapAgentFindingToVuln(f: AgentFinding, scanId: string): Vulnerability {
  return {
    id: f.id,
    scan_id: scanId,
    title: f.title,
    vulnerability_type: f.vulnerability_type,
    severity: f.severity,
    cvss_score: f.cvss_score || null,
    cvss_vector: f.cvss_vector || null,
    cwe_id: f.cwe_id || null,
    description: f.description || null,
    affected_endpoint: f.affected_endpoint || null,
    poc_request: f.request || null,
    poc_response: f.response || null,
    poc_payload: f.payload || null,
    poc_parameter: f.parameter || null,
    poc_evidence: f.evidence || null,
    poc_code: f.poc_code || null,
    impact: f.impact || null,
    remediation: f.remediation || null,
    references: f.references || [],
    ai_analysis: f.evidence || null,
    validation_status: f.ai_status === 'rejected' ? 'ai_rejected' : 'ai_confirmed',
    ai_rejection_reason: f.rejection_reason || null,
    confidence_score: f.confidence_score,
    confidence_breakdown: f.confidence_breakdown,
    proof_of_execution: f.proof_of_execution,
    negative_controls: f.negative_controls,
    created_at: new Date().toISOString()
  }
}

function SeverityTag({ severity }: { severity?: string }) {
  const value = severity || 'info'
  return <Tag color={SEVERITY_COLORS[value] || 'default'}>{value.toUpperCase()}</Tag>
}

function StatusBadge({ status }: { status?: string }) {
  const value = status || 'pending'
  return <Badge status={(STATUS_COLORS[value] || 'default') as any} text={value} />
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 1050, width: 360 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        {toasts.map(toast => (
          <Alert
            key={toast.id}
            showIcon
            closable
            onClose={() => onDismiss(toast.id)}
            type={toast.severity === 'critical' || toast.severity === 'error' ? 'error' : toast.severity === 'completed' ? 'success' : toast.severity === 'high' || toast.severity === 'medium' ? 'warning' : 'info'}
            message={toast.message}
          />
        ))}
      </Space>
    </div>
  )
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre style={{ margin: 0, padding: 12, background: '#141414', color: '#d9d9d9', borderRadius: 6, overflow: 'auto', maxHeight: 360, whiteSpace: 'pre-wrap' }}>
      {value}
    </pre>
  )
}

function SeveritySummary({ counts }: { counts: Record<string, number> }) {
  return (
    <Space wrap>
      {['critical', 'high', 'medium', 'low', 'info'].map(sev => {
        const count = counts[sev] || 0
        if (count === 0) return null
        return <Tag key={sev} color={SEVERITY_COLORS[sev]}>{sev.toUpperCase()}: {count}</Tag>
      })}
    </Space>
  )
}

function ToolExecutionTable({ toolExecutions, expandedTool, setExpandedTool, t }: {
  toolExecutions: ToolExecution[]
  expandedTool: string | null
  setExpandedTool: (value: string | null) => void
  t: (key: string) => string
}) {
  return (
    <Table<ToolExecution>
      rowKey={(record, index) => record.task_id || String(index)}
      size="small"
      pagination={false}
      dataSource={toolExecutions}
      expandable={{
        expandedRowKeys: expandedTool ? [expandedTool] : [],
        onExpand: (expanded, record) => setExpandedTool(expanded ? record.task_id || '' : null),
        rowExpandable: record => Boolean(record.stdout_preview || record.stderr_preview || record.reason),
        expandedRowRender: record => (
          <Space direction="vertical" style={{ width: '100%' }}>
            {record.reason && <Text type="secondary">{t('scanDetails.reason')}: {record.reason}</Text>}
            {record.stdout_preview && <CodeBlock value={record.stdout_preview} />}
            {record.stderr_preview && <CodeBlock value={record.stderr_preview} />}
            {record.container_name && <Text type="secondary">{t('scanDetails.container')}: {record.container_name}</Text>}
          </Space>
        ),
      }}
      columns={[
        { title: t('scanDetails.task'), dataIndex: 'task_id', width: 100, render: value => <Text code>{String(value || '---').slice(0, 8)}</Text> },
        { title: t('scanDetails.tool'), dataIndex: 'tool', width: 120, render: value => <Tag color="cyan">{value}</Tag> },
        { title: t('scanDetails.command'), dataIndex: 'command', ellipsis: true, render: value => <Text>{value}</Text> },
        { title: t('scanDetails.exit'), dataIndex: 'exit_code', width: 80, align: 'center', render: value => value === 0 ? <Tag color="success">0</Tag> : value !== null && value !== undefined ? <Tag color="error">{value}</Tag> : <Tag>...</Tag> },
        { title: t('scanDetails.duration'), dataIndex: 'duration', width: 100, align: 'right', render: value => value !== null && value !== undefined ? `${Number(value).toFixed(1)}s` : '---' },
        { title: t('scanDetails.finds'), dataIndex: 'findings_count', width: 80, align: 'center' },
      ]}
    />
  )
}

function ContainerTelemetry({ containerStatus, toolExecutions, expandedTool, setExpandedTool, isRunning, t }: {
  containerStatus: ContainerStatus
  toolExecutions: ToolExecution[]
  expandedTool: string | null
  setExpandedTool: (value: string | null) => void
  isRunning: boolean
  t: (key: string) => string
}) {
  return (
    <ProCard
      title={<Space><CodeOutlined />{t('scanDetails.containerTelemetry')}</Space>}
      extra={(
        <Space>
          <Badge status={containerStatus.online ? 'success' : 'error'} text={containerStatus.online ? t('scanDetails.online') : t('scanDetails.offline')} />
          {containerStatus.container_id && <Text code>ID: {containerStatus.container_id.slice(0, 12)}</Text>}
        </Space>
      )}
    >
      {toolExecutions.length > 0 ? (
        <ToolExecutionTable toolExecutions={toolExecutions} expandedTool={expandedTool} setExpandedTool={setExpandedTool} t={t} />
      ) : (
        <Empty description={isRunning ? t('scanDetails.waitingToolExec') : t('scanDetails.noToolExecs')} />
      )}
    </ProCard>
  )
}

function LogViewer({ logs, logFilter, setLogFilter, logSearch, setLogSearch, t }: {
  logs: AgentLog[]
  logFilter: string
  setLogFilter: (f: string) => void
  logSearch: string
  setLogSearch: (s: string) => void
  t: (key: string, options?: any) => string
}) {
  const logScrollRef = useRef<HTMLDivElement>(null)
  const [followLatest, setFollowLatest] = useState(true)
  const filters = [
    { key: 'all', label: t('common.all') },
    { key: 'stream1', label: t('autoPentest.recon') },
    { key: 'stream2', label: t('autoPentest.juniorAi') },
    { key: 'stream3', label: t('autoPentest.tools') },
    { key: 'deep', label: t('newScan.deepAnalysis') },
    { key: 'error', label: t('common.error') },
  ]

  const filteredLogs = useMemo(() => logs.filter(log => {
    if (!matchLogFilter(log, logFilter)) return false
    if (logSearch && !log.message.toLowerCase().includes(logSearch.toLowerCase())) return false
    return true
  }), [logs, logFilter, logSearch])

  const onLogScroll = useCallback(() => {
    const el = logScrollRef.current
    if (!el || !followLatest) return
    if (!isLogContainerNearBottom(el)) setFollowLatest(false)
  }, [followLatest])

  useEffect(() => {
    if (!followLatest) return
    const el = logScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs, logFilter, logSearch, followLatest, filteredLogs.length])

  return (
    <ProCard title={t('scanDetails.activityLog')} extra={<Text type="secondary">{filteredLogs.length}/{logs.length}</Text>}>
      <Space wrap style={{ marginBottom: 12, width: '100%' }}>
        <Radio.Group size="small" value={logFilter} onChange={e => setLogFilter(e.target.value)}>
          {filters.map(filter => <Radio.Button key={filter.key} value={filter.key}>{filter.label}</Radio.Button>)}
        </Radio.Group>
        <Checkbox
          checked={followLatest}
          onChange={e => {
            const on = e.target.checked
            setFollowLatest(on)
            if (on) {
              requestAnimationFrame(() => {
                const el = logScrollRef.current
                if (el) el.scrollTop = el.scrollHeight
              })
            }
          }}
        >
          {t('autoPentest.followLatestLogs')}
        </Checkbox>
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined />}
          value={logSearch}
          onChange={e => setLogSearch(e.target.value)}
          placeholder={`${t('common.search')}...`}
          style={{ width: 220 }}
        />
      </Space>
      <div ref={logScrollRef} onScroll={onLogScroll} style={{ maxHeight: 460, overflow: 'auto', background: '#141414', borderRadius: 8, padding: 12, fontFamily: 'monospace' }}>
        {filteredLogs.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={logs.length === 0 ? t('scanDetails.waitingForActivity') : t('scanDetails.noLogsMatch')} />
        ) : (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {filteredLogs.map((log, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '76px 64px 1fr', gap: 8, color: '#d9d9d9' }}>
                <Text type="secondary">{log.time?.slice(11, 19) || new Date(log.time).toLocaleTimeString().slice(0, 8)}</Text>
                <Tag color={log.level === 'error' ? 'error' : log.level === 'warning' ? 'warning' : log.level === 'success' ? 'success' : 'processing'}>{log.level}</Tag>
                <Text style={{ color: getLogMessageColor(log.message) || (log.source === 'llm' ? '#b37feb' : undefined) }}>{log.message}</Text>
              </div>
            ))}
          </Space>
        )}
      </div>
    </ProCard>
  )
}

export default function ScanDetailsPage() {
  const { scanId } = useParams<{ scanId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { message } = AntApp.useApp()
  const { hasPermission } = usePermission()
  const {
    currentScan, endpoints, vulnerabilities, logs, agentTasks,
    setCurrentScan, setEndpoints, setVulnerabilities,
    addEndpoint, addVulnerability, addLog, updateScan,
    addAgentTask, updateAgentTask, setAgentTasks,
    loadScanData, saveScanData, getVulnCounts
  } = useScanStore()

  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [isGeneratingAiReport, setIsGeneratingAiReport] = useState(false)
  const [expandedVulns, setExpandedVulns] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'vulns' | 'endpoints' | 'tasks' | 'logs'>('vulns')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoGeneratedReport, setAutoGeneratedReport] = useState<Report | null>(null)
  const [agentData, setAgentData] = useState<AgentStatus | null>(null)
  const [skipConfirm, setSkipConfirm] = useState<string | null>(null)
  const [skippedPhases, setSkippedPhases] = useState<Set<string>>(new Set())
  const [validationFilter, setValidationFilter] = useState<'all' | 'confirmed' | 'rejected' | 'validated'>('all')
  const [feedbackVulnId, setFeedbackVulnId] = useState<string | null>(null)
  const [feedbackIsTp, setFeedbackIsTp] = useState(true)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [learningPatternCount, setLearningPatternCount] = useState<number | null>(null)
  const [availableModels, setAvailableModels] = useState<Array<{ provider_id: string; provider_name: string; default_model: string; tier: number; available_models: string[] }>>([])
  const [reportProvider, setReportProvider] = useState('')
  const [reportModel, setReportModel] = useState('')
  const [showReportModelPicker, setShowReportModelPicker] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([])
  const [logFilter, setLogFilter] = useState('all')
  const [logSearch, setLogSearch] = useState('')
  const [expandedTool, setExpandedTool] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [newFindingIds, setNewFindingIds] = useState<Set<string>>(new Set())
  const [connectionLost, setConnectionLost] = useState(false)

  const seenVulnIdsRef = useRef<Set<string>>(new Set())
  const prevPhaseRef = useRef<string | null>(null)
  const consecutiveErrorsRef = useRef(0)
  const newFindingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const vulnCounts = useMemo(() => getVulnCounts(), [getVulnCounts, vulnerabilities])
  const isRunning = currentScan?.status === 'running' || currentScan?.status === 'paused'
  const toolExecutions: ToolExecution[] = agentData?.tool_executions || []
  const containerStatus: ContainerStatus | undefined = agentData?.container_status
  const displayLogs: AgentLog[] = agentLogs.length > 0 ? agentLogs : logs

  const filteredVulnerabilities = useMemo(() => vulnerabilities.filter(vuln => {
    if (validationFilter === 'all') return true
    if (validationFilter === 'confirmed') return !vuln.validation_status || vuln.validation_status === 'ai_confirmed' || vuln.validation_status === 'validated'
    if (validationFilter === 'rejected') return vuln.validation_status === 'ai_rejected' || vuln.validation_status === 'false_positive'
    if (validationFilter === 'validated') return vuln.validation_status === 'validated'
    return true
  }), [validationFilter, vulnerabilities])

  const providerOptions = availableModels.map(provider => ({ label: provider.provider_name, value: provider.provider_id }))
  const modelOptions = (reportProvider
    ? availableModels.find(provider => provider.provider_id === reportProvider)?.available_models || []
    : [...new Set(availableModels.flatMap(provider => provider.available_models))]
  ).map(model => ({ label: model, value: model }))

  const addToast = useCallback((toastMessage: string, severity: string = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setToasts(prev => [...prev.slice(-(MAX_TOASTS - 1)), { id, message: toastMessage, severity, timestamp: Date.now() }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_DURATION)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    providersApi.getAvailableModels()
      .then(data => setAvailableModels(data.providers || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isRunning || !currentScan?.started_at) return
    const startTime = new Date(currentScan.started_at).getTime()
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isRunning, currentScan?.started_at])

  useEffect(() => {
    if (!scanId) return

    loadScanData(scanId)

    const fetchData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const scan = await scansApi.get(scanId)
        setCurrentScan(scan)

        const [endpointsData, vulnsData, tasksData, reportsData] = await Promise.all([
          scansApi.getEndpoints(scanId),
          scansApi.getVulnerabilities(scanId),
          agentTasksApi.list(scanId).catch(() => ({ tasks: [] })),
          reportsApi.list({ scanId, autoGenerated: true }).catch(() => ({ reports: [] }))
        ])

        if (endpointsData.endpoints?.length > 0) setEndpoints(endpointsData.endpoints)
        if (vulnsData.vulnerabilities?.length > 0) setVulnerabilities(vulnsData.vulnerabilities)
        if (tasksData.tasks?.length > 0) setAgentTasks(tasksData.tasks)
        if (reportsData.reports?.length > 0) setAutoGeneratedReport(reportsData.reports[0])

        try {
          const agentStatus = await agentApi.getByScan(scanId)
          if (agentStatus) {
            setAgentData(agentStatus)
            if (!vulnsData.vulnerabilities || vulnsData.vulnerabilities.length === 0) {
              if (agentStatus.findings && agentStatus.findings.length > 0) {
                const confirmed = agentStatus.findings.map(f => mapAgentFindingToVuln(f, scanId))
                const rejected = (agentStatus.rejected_findings || []).map(f => mapAgentFindingToVuln(f, scanId))
                setVulnerabilities([...confirmed, ...rejected])
              }
              if (agentStatus.progress !== undefined) {
                updateScan(scanId, { progress: agentStatus.progress, current_phase: agentStatus.phase })
              }
            }
            seenVulnIdsRef.current = new Set((agentStatus.findings || []).map(f => f.id))
          }
        } catch {}
      } catch (err: any) {
        console.error('Failed to fetch scan:', err)
        setError(err?.response?.data?.detail || 'Failed to load scan')
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()

    const pollInterval = setInterval(async () => {
      if (currentScan?.status === 'running' || currentScan?.status === 'paused' || !currentScan) {
        try {
          const scan = await scansApi.get(scanId)
          setCurrentScan(scan)
          consecutiveErrorsRef.current = 0
          if (connectionLost) setConnectionLost(false)

          const [endpointsData, vulnsData, tasksData] = await Promise.all([
            scansApi.getEndpoints(scanId),
            scansApi.getVulnerabilities(scanId),
            agentTasksApi.list(scanId).catch(() => ({ tasks: [] }))
          ])

          if (endpointsData.endpoints?.length > 0) setEndpoints(endpointsData.endpoints)
          if (vulnsData.vulnerabilities?.length > 0) setVulnerabilities(vulnsData.vulnerabilities)
          if (tasksData.tasks?.length > 0) setAgentTasks(tasksData.tasks)

          try {
            const agentStatus = await agentApi.getByScan(scanId)
            if (agentStatus) {
              setAgentData(agentStatus)

              if (prevPhaseRef.current && agentStatus.phase && agentStatus.phase !== prevPhaseRef.current) {
                addToast(`Phase: ${agentStatus.phase}`, 'info')
              }
              prevPhaseRef.current = agentStatus.phase || null

              const currentIds = new Set((agentStatus.findings || []).map(f => f.id))
              if (seenVulnIdsRef.current.size > 0) {
                const newIds = [...currentIds].filter(id => !seenVulnIdsRef.current.has(id))
                if (newIds.length > 0) {
                  newIds.forEach(id => {
                    const finding = agentStatus.findings?.find(item => item.id === id)
                    if (finding) addToast(`${finding.severity.toUpperCase()}: ${finding.title}`, finding.severity)
                  })
                  setNewFindingIds(new Set(newIds))
                  if (newFindingTimerRef.current) clearTimeout(newFindingTimerRef.current)
                  newFindingTimerRef.current = setTimeout(() => setNewFindingIds(new Set()), 3000)
                }
              }
              seenVulnIdsRef.current = currentIds

              if (!vulnsData.vulnerabilities || vulnsData.vulnerabilities.length === 0) {
                if (agentStatus.findings && agentStatus.findings.length > 0) {
                  const confirmed = agentStatus.findings.map(f => mapAgentFindingToVuln(f, scanId))
                  const rejected = (agentStatus.rejected_findings || []).map(f => mapAgentFindingToVuln(f, scanId))
                  setVulnerabilities([...confirmed, ...rejected])
                }
                if (agentStatus.progress !== undefined) {
                  updateScan(scanId, { progress: agentStatus.progress, current_phase: agentStatus.phase })
                }
              }
            }
          } catch {}

          if (agentData?.agent_id) {
            try {
              const logData = await agentApi.getLogs(agentData.agent_id, 300)
              setAgentLogs(logData.logs || [])
            } catch {}
          }
        } catch (err) {
          consecutiveErrorsRef.current += 1
          if (consecutiveErrorsRef.current >= 3) setConnectionLost(true)
          console.error('Poll error:', err)
        }
      }
    }, connectionLost ? POLL_INTERVAL_ERROR : POLL_INTERVAL)

    wsService.connect(scanId)

    const unsubscribe = wsService.subscribe('*', (wsMessage: WSMessage) => {
      switch (wsMessage.type) {
        case 'progress_update':
          updateScan(scanId, { progress: wsMessage.progress as number, current_phase: wsMessage.message as string })
          break
        case 'phase_change': {
          const phase = wsMessage.phase as string
          updateScan(scanId, { current_phase: phase })
          addLog('info', `Phase: ${phase}`)
          addToast(`Phase: ${phase}`, 'info')
          if (phase.endsWith('_skipped')) setSkippedPhases(prev => new Set([...prev, phase.replace('_skipped', '')]))
          break
        }
        case 'endpoint_found':
          addEndpoint(wsMessage.endpoint as Endpoint)
          break
        case 'vuln_found':
          addVulnerability(wsMessage.vulnerability as Vulnerability)
          addLog('warning', `Found: ${(wsMessage.vulnerability as Vulnerability).title}`)
          addToast(`Found: ${(wsMessage.vulnerability as Vulnerability).title}`, (wsMessage.vulnerability as Vulnerability).severity || 'medium')
          break
        case 'stats_update':
          if (wsMessage.stats) {
            const stats = wsMessage.stats as { total_vulnerabilities?: number; critical?: number; high?: number; medium?: number; low?: number; info?: number; total_endpoints?: number }
            updateScan(scanId, {
              total_vulnerabilities: stats.total_vulnerabilities,
              critical_count: stats.critical,
              high_count: stats.high,
              medium_count: stats.medium,
              low_count: stats.low,
              info_count: stats.info,
              total_endpoints: stats.total_endpoints
            })
          }
          break
        case 'log_message':
          addLog(wsMessage.level as string, wsMessage.message as string)
          break
        case 'scan_completed':
          updateScan(scanId, { status: 'completed', progress: 100 })
          addLog('info', 'Scan completed')
          addToast(t('scanDetails.scanComplete'), 'completed')
          saveScanData(scanId)
          break
        case 'scan_stopped':
          if (wsMessage.summary) {
            const summary = wsMessage.summary as { total_vulnerabilities?: number; critical?: number; high?: number; medium?: number; low?: number; info?: number; total_endpoints?: number; duration?: number; progress?: number }
            updateScan(scanId, {
              status: 'stopped',
              progress: summary.progress || currentScan?.progress,
              total_vulnerabilities: summary.total_vulnerabilities,
              critical_count: summary.critical,
              high_count: summary.high,
              medium_count: summary.medium,
              low_count: summary.low,
              info_count: summary.info,
              total_endpoints: summary.total_endpoints,
              duration: summary.duration
            })
          } else {
            updateScan(scanId, { status: 'stopped' })
          }
          addLog('warning', 'Scan stopped by user')
          addToast(t('scanDetails.scanStopped'), 'info')
          saveScanData(scanId)
          break
        case 'scan_failed':
          updateScan(scanId, { status: 'failed' })
          addLog('error', `Scan failed: ${wsMessage.error || 'Unknown error'}`)
          addToast(t('scanDetails.scanFailed'), 'error')
          saveScanData(scanId)
          break
        case 'agent_task':
        case 'agent_task_started':
          if (wsMessage.task) addAgentTask(wsMessage.task as ScanAgentTask)
          break
        case 'agent_task_completed':
          if (wsMessage.task) {
            const task = wsMessage.task as ScanAgentTask
            updateAgentTask(task.id, task)
          }
          break
        case 'report_generated':
          if (wsMessage.report) {
            const report = wsMessage.report as Report
            setAutoGeneratedReport(report)
            addLog('info', `Report generated: ${report.title}`)
            addToast(t('scanDetails.reportGenerated'), 'completed')
          }
          break
        case 'error':
          addLog('error', wsMessage.error as string)
          break
      }
    })

    return () => {
      saveScanData(scanId)
      unsubscribe()
      wsService.disconnect()
      clearInterval(pollInterval)
    }
  }, [scanId])

  const handleStopScan = async () => {
    if (!scanId) return
    try {
      await scansApi.stop(scanId)
      updateScan(scanId, { status: 'stopped' })
      saveScanData(scanId)
      message.success(t('scanDetails.scanStopped'))
    } catch (err) { console.error('Failed to stop scan:', err) }
  }

  const handlePauseScan = async () => {
    if (!scanId) return
    try {
      await scansApi.pause(scanId)
      updateScan(scanId, { status: 'paused' })
    } catch (err) { console.error('Failed to pause scan:', err) }
  }

  const handleResumeScan = async () => {
    if (!scanId) return
    try {
      await scansApi.resume(scanId)
      updateScan(scanId, { status: 'running' })
    } catch (err) { console.error('Failed to resume scan:', err) }
  }

  const handleSkipToPhase = async (phase: string) => {
    if (!scanId) return
    try {
      await scansApi.skipToPhase(scanId, phase)
      setSkipConfirm(null)
      addToast(`Skipping to ${phase}`, 'info')
    } catch (err) { console.error('Failed to skip phase:', err) }
  }

  const handleGenerateReport = async () => {
    if (!scanId) return
    setIsGeneratingReport(true)
    try {
      const report = await reportsApi.generate({ scan_id: scanId, format: 'html', include_poc: true, include_remediation: true })
      window.open(reportsApi.getViewUrl(report.id), '_blank')
      addToast(t('scanDetails.reportGenerated'), 'completed')
    } catch (err) { console.error('Failed to generate report:', err) }
    finally { setIsGeneratingReport(false) }
  }

  const handleGenerateAiReport = async () => {
    if (!scanId) return
    setIsGeneratingAiReport(true)
    setShowReportModelPicker(false)
    try {
      const report = await reportsApi.generateAiReport({
        scan_id: scanId,
        title: `AI Report - ${currentScan?.name || 'Scan'}`,
        preferred_provider: reportProvider || undefined,
        preferred_model: reportModel || undefined,
      })
      window.open(reportsApi.getViewUrl(report.id), '_blank')
      addToast(t('scanDetails.aiReportGenerated'), 'completed')
    } catch (err) { console.error('Failed to generate AI report:', err) }
    finally { setIsGeneratingAiReport(false) }
  }

  const toggleVuln = (id: string) => {
    const next = new Set(expandedVulns)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedVulns(next)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    addToast(t('scanDetails.copiedToClipboard'), 'info')
  }

  const endpointColumns: ProColumns<Endpoint>[] = [
    { title: 'Method', dataIndex: 'method', width: 100, render: (_, row) => <Tag color={row.method === 'GET' ? 'success' : row.method === 'POST' ? 'processing' : row.method === 'PUT' ? 'warning' : row.method === 'DELETE' ? 'error' : 'default'}>{row.method}</Tag> },
    { title: 'Path', dataIndex: 'path', ellipsis: true, render: (_, row) => <Text code>{row.path || row.url}</Text> },
    { title: 'Params', dataIndex: 'parameters', width: 100, render: (_, row) => row.parameters?.length || 0 },
    { title: 'Content-Type', dataIndex: 'content_type', width: 180, ellipsis: true },
    { title: 'Status', dataIndex: 'response_status', width: 100, render: (_, row) => row.response_status ? <Tag color={row.response_status < 300 ? 'success' : row.response_status < 400 ? 'warning' : 'error'}>{row.response_status}</Tag> : '-' },
  ]

  const taskColumns: ProColumns<ScanAgentTask>[] = [
    { title: t('scanDetails.agentTasks'), dataIndex: 'task_name', ellipsis: true, render: (_, row) => <Space direction="vertical" size={0}><Text strong>{row.task_name}</Text>{row.description && <Text type="secondary">{row.description}</Text>}</Space> },
    { title: 'Tool', dataIndex: 'tool_name', width: 140, render: value => value ? <Tag>{value}</Tag> : '-' },
    { title: 'Type', dataIndex: 'task_type', width: 120, render: value => <Tag color={value === 'recon' ? 'blue' : value === 'analysis' ? 'purple' : value === 'testing' ? 'orange' : 'green'}>{value}</Tag> },
    { title: 'Status', dataIndex: 'status', width: 120, render: value => <Badge status={value === 'completed' ? 'success' : value === 'running' ? 'processing' : value === 'failed' ? 'error' : 'default'} text={value} /> },
    { title: t('scanDetails.duration'), dataIndex: 'duration_ms', width: 120, render: value => value !== null && value !== undefined ? Number(value) < 1000 ? `${value}ms` : `${(Number(value) / 1000).toFixed(1)}s` : '-' },
    { title: t('scanDetails.finds'), dataIndex: 'items_found', width: 100 },
  ]

  if (isLoading) {
    return <PageContainer><ProCard><Spin tip={t('common.loading')} style={{ width: '100%', padding: 64 }} /></ProCard></PageContainer>
  }

  if (error) {
    return (
      <PageContainer>
        <Alert
          showIcon
          type="error"
          message={t('scanDetails.failedToLoad')}
          description={error}
          action={<Button onClick={() => navigate('/')}>{t('sidebar.dashboard')}</Button>}
        />
      </PageContainer>
    )
  }

  if (!currentScan) {
    return (
      <PageContainer>
        <Alert
          showIcon
          type="warning"
          message={t('scanDetails.scanNotFound')}
          description={t('scanDetails.scanInitializing')}
          action={<Space><Button onClick={() => window.location.reload()}>{t('common.refresh')}</Button><Button onClick={() => navigate('/')}>{t('sidebar.dashboard')}</Button></Space>}
        />
      </PageContainer>
    )
  }

  const phases = [
    { id: 'initializing', title: t('scanDetails.init'), description: t('scanDetails.initializing') },
    { id: 'recon', title: t('scanDetails.recon'), description: t('scanDetails.recon') },
    { id: 'analyzing', title: t('scanDetails.analysis'), description: t('scanDetails.analysis') },
    { id: 'testing', title: t('scanDetails.testing'), description: t('scanDetails.testing') },
    { id: 'completed', title: t('scanDetails.completed'), description: t('scanDetails.completed') },
  ]
  const rawPhase = currentScan.current_phase || 'initializing'
  const currentPhase = rawPhase.startsWith('skipping_to_') ? rawPhase.replace('skipping_to_', '') : rawPhase.replace('_skipped', '')
  const currentStep = Math.max(0, phases.findIndex(phase => phase.id === currentPhase))
  const scanIsRunning = currentScan.status === 'running' || currentScan.status === 'paused'

  return (
    <PageContainer
      title={<Space><SafetyCertificateOutlined />{currentScan.name || t('scanDetails.unnamedScan')}</Space>}
      subTitle={<Space wrap><StatusBadge status={currentScan.status} /><Text type="secondary">{t('scanDetails.started')} {new Date(currentScan.created_at).toLocaleString()}</Text>{isRunning && elapsedSeconds > 0 && <Tag icon={<ClockCircleOutlined />}>{formatElapsed(elapsedSeconds)}</Tag>}</Space>}
      extra={[
        agentData?.agent_id ? <Button key="agent" icon={<RobotOutlined />} onClick={() => navigate(`/agent/${agentData.agent_id}`)}>{t('scanDetails.agentView')}</Button> : null,
        currentScan.status === 'running' && hasPermission('scan:execute') ? <Button key="pause" icon={<PauseCircleOutlined />} onClick={handlePauseScan}>{t('scanDetails.pause')}</Button> : null,
        currentScan.status === 'paused' && hasPermission('scan:execute') ? <Button key="resume" type="primary" icon={<PlayCircleOutlined />} onClick={handleResumeScan}>{t('scanDetails.resume')}</Button> : null,
        (currentScan.status === 'running' || currentScan.status === 'paused') && hasPermission('scan:execute') ? <Popconfirm key="stop" title={t('scanDetails.stop')} onConfirm={handleStopScan}><Button danger icon={<StopOutlined />}>{t('scanDetails.stop')}</Button></Popconfirm> : null,
        autoGeneratedReport ? <Button key="view-report" icon={<FileTextOutlined />} onClick={() => window.open(reportsApi.getViewUrl(autoGeneratedReport.id), '_blank')}>{t('scanDetails.viewReport')}</Button> : null,
        autoGeneratedReport ? <Button key="download-report" icon={<DownloadOutlined />} onClick={() => window.open(reportsApi.getDownloadZipUrl(autoGeneratedReport.id), '_blank')}>{t('scanDetails.downloadZip')}</Button> : null,
        (currentScan.status === 'completed' || currentScan.status === 'stopped') ? <Button key="report" type="primary" loading={isGeneratingReport} icon={<FileTextOutlined />} onClick={handleGenerateReport}>{autoGeneratedReport ? t('scanDetails.newReport') : t('scanDetails.generateReport')}</Button> : null,
        (currentScan.status === 'completed' || currentScan.status === 'stopped') ? <Button key="ai-report" loading={isGeneratingAiReport} icon={<ThunderboltOutlined />} onClick={() => setShowReportModelPicker(true)}>{t('scanDetails.aiReport')}{reportProvider ? ` (${reportProvider})` : ''}</Button> : null,
      ].filter(Boolean)}
    >
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {connectionLost && <Alert showIcon type="warning" message={t('scanDetails.connectionIssues')} icon={<ReloadOutlined spin />} />}

        {(currentScan.status === 'running' || currentScan.status === 'paused' || currentScan.status === 'completed' || currentScan.status === 'stopped') && (
          <ProCard>
            <Steps
              current={currentStep}
              status={currentScan.status === 'paused' ? 'process' : 'process'}
              items={phases.map((phase, index) => {
                const isFuture = index > currentStep && scanIsRunning
                const isSkipped = skippedPhases.has(phase.id)
                return {
                  title: isSkipped ? `${phase.title} (${t('scanDetails.skipped')})` : phase.title,
                  description: isFuture && phase.id !== 'initializing' ? (
                    skipConfirm === phase.id ? (
                      <Space>
                        <Button size="small" type="link" icon={<CheckOutlined />} onClick={() => handleSkipToPhase(phase.id)}>{t('scanDetails.skipHere')}</Button>
                        <Button size="small" type="link" icon={<CloseCircleOutlined />} onClick={() => setSkipConfirm(null)} />
                      </Space>
                    ) : (
                      <Button size="small" type="link" onClick={() => setSkipConfirm(phase.id)}>{t('scanDetails.skipHere')}</Button>
                    )
                  ) : phase.description,
                  icon: isSkipped ? <MinusOutlined /> : undefined,
                }
              })}
            />
            <Space direction="vertical" style={{ width: '100%', marginTop: 20 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>{rawPhase.startsWith('skipping_to_') ? `${t('scanDetails.skippingTo')} ${rawPhase.replace('skipping_to_', '')}...` : currentScan.current_phase || t('scanDetails.initializing')}</Text>
                <Text strong>{currentScan.progress}%</Text>
              </Space>
              <Progress percent={currentScan.progress || 0} status={currentScan.status === 'completed' ? 'success' : 'active'} />
            </Space>
          </ProCard>
        )}

        {autoGeneratedReport && (
          <Alert
            showIcon
            type="success"
            message={autoGeneratedReport.is_partial ? t('scanDetails.partialReport') : t('scanDetails.reportGenerated')}
            description={autoGeneratedReport.title || t('scanDetails.reportReady')}
            action={<Space><Button icon={<LinkOutlined />} onClick={() => window.open(reportsApi.getViewUrl(autoGeneratedReport.id), '_blank')}>{t('scanDetails.viewReport')}</Button><Button onClick={() => setAutoGeneratedReport(null)}>{t('common.dismiss')}</Button></Space>}
          />
        )}

        <Row gutter={[16, 16]}>
          <Col xs={12} md={8} lg={4}><StatisticCard statistic={{ title: t('scanDetails.endpoints'), value: endpoints.length, icon: <GlobalOutlined /> }} /></Col>
          <Col xs={12} md={8} lg={4}><StatisticCard statistic={{ title: t('scanDetails.totalVulns'), value: vulnerabilities.length, icon: <BugOutlined /> }} /></Col>
          <Col xs={12} md={8} lg={4}><StatisticCard statistic={{ title: t('scanDetails.critical'), value: vulnCounts.critical, valueStyle: { color: '#cf1322' } }} /></Col>
          <Col xs={12} md={8} lg={4}><StatisticCard statistic={{ title: t('scanDetails.high'), value: vulnCounts.high, valueStyle: { color: '#fa541c' } }} /></Col>
          <Col xs={12} md={8} lg={4}><StatisticCard statistic={{ title: t('scanDetails.medium'), value: vulnCounts.medium, valueStyle: { color: '#d48806' } }} /></Col>
          <Col xs={12} md={8} lg={4}><StatisticCard statistic={{ title: t('scanDetails.low'), value: vulnCounts.low, valueStyle: { color: '#1677ff' } }} /></Col>
        </Row>

        {containerStatus && activeTab !== 'logs' && (
          <ContainerTelemetry containerStatus={containerStatus} toolExecutions={toolExecutions} expandedTool={expandedTool} setExpandedTool={setExpandedTool} isRunning={Boolean(isRunning)} t={t} />
        )}

        <Tabs
          activeKey={activeTab}
          onChange={key => setActiveTab(key as typeof activeTab)}
          items={[
            {
              key: 'vulns',
              label: <Space><ExclamationCircleOutlined />{t('scanDetails.vulnerabilities')}<Badge count={vulnerabilities.length} size="small" /></Space>,
              children: (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  {vulnerabilities.length > 0 && (
                    <ProCard>
                      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Radio.Group value={validationFilter} onChange={event => setValidationFilter(event.target.value)}>
                          {(['all', 'confirmed', 'rejected', 'validated'] as const).map(filter => {
                            const count = filter === 'all' ? vulnerabilities.length
                              : filter === 'confirmed' ? vulnerabilities.filter(v => !v.validation_status || v.validation_status === 'ai_confirmed' || v.validation_status === 'validated').length
                              : filter === 'rejected' ? vulnerabilities.filter(v => v.validation_status === 'ai_rejected' || v.validation_status === 'false_positive').length
                              : vulnerabilities.filter(v => v.validation_status === 'validated').length
                            return <Radio.Button key={filter} value={filter}>{filter.charAt(0).toUpperCase() + filter.slice(1)} ({count})</Radio.Button>
                          })}
                        </Radio.Group>
                        <SeveritySummary counts={vulnCounts} />
                      </Space>
                    </ProCard>
                  )}

                  {vulnerabilities.length === 0 ? (
                    <ProCard><Empty description={currentScan.status === 'running' ? t('scanDetails.scanningForVulns') : t('scanDetails.noVulnsFound')} /></ProCard>
                  ) : (
                    <List
                      dataSource={filteredVulnerabilities}
                      renderItem={(vuln, index) => {
                        const vulnKey = vuln.id || `vuln-${index}`
                        const isExpanded = expandedVulns.has(vulnKey)
                        const confidence = getConfidenceDisplay(vuln, t)
                        const isNew = newFindingIds.has(vuln.id)
                        return (
                          <Card
                            size="small"
                            style={{ marginBottom: 12, borderColor: isNew ? '#1677ff' : undefined, opacity: vuln.validation_status === 'false_positive' ? 0.65 : 1 }}
                            title={(
                              <Space wrap>
                                <Button type="text" size="small" icon={isExpanded ? <DownOutlined /> : <RightOutlined />} onClick={() => toggleVuln(vulnKey)} />
                                <Text strong>{vuln.title}</Text>
                                <SeverityTag severity={vuln.severity} />
                                {vuln.cvss_score && <Tag color={vuln.cvss_score >= 9 ? 'red' : vuln.cvss_score >= 7 ? 'volcano' : vuln.cvss_score >= 4 ? 'gold' : 'blue'}>CVSS {vuln.cvss_score.toFixed(1)}</Tag>}
                                {confidence && <Tag color={CONFIDENCE_COLORS[confidence.color]}>{confidence.score}/100 {confidence.label}</Tag>}
                                {vuln.validation_status === 'ai_rejected' && <Tag color="orange" icon={<ExclamationCircleOutlined />}>{t('scanDetails.rejected')}</Tag>}
                                {vuln.validation_status === 'validated' && <Tag color="success" icon={<CheckCircleOutlined />}>{t('scanDetails.validated')}</Tag>}
                                {vuln.validation_status === 'false_positive' && <Tag icon={<CloseCircleOutlined />}>FP</Tag>}
                                {(!vuln.validation_status || vuln.validation_status === 'ai_confirmed') && <Tag color="green">AI {t('scanDetails.confirmed')}</Tag>}
                              </Space>
                            )}
                            extra={<Text type="secondary" ellipsis style={{ maxWidth: 320 }}>{vuln.affected_endpoint}</Text>}
                          >
                            {isExpanded && (
                              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                                  {vuln.vulnerability_type && <Descriptions.Item label="Type">{vuln.vulnerability_type}</Descriptions.Item>}
                                  {vuln.cwe_id && <Descriptions.Item label="CWE"><a href={`https://cwe.mitre.org/data/definitions/${vuln.cwe_id.replace('CWE-', '')}.html`} target="_blank" rel="noopener noreferrer">{vuln.cwe_id}</a></Descriptions.Item>}
                                  {vuln.cvss_vector && <Descriptions.Item label="CVSS Vector"><Text code>{vuln.cvss_vector}</Text></Descriptions.Item>}
                                  {vuln.affected_endpoint && <Descriptions.Item label="Endpoint" span={3}><Text code>{vuln.affected_endpoint}</Text></Descriptions.Item>}
                                </Descriptions>

                                {confidence && (
                                  <Alert
                                    showIcon
                                    type={confidence.color === 'green' ? 'success' : confidence.color === 'yellow' ? 'warning' : 'error'}
                                    message={<Space><SafetyCertificateOutlined />{t('scanDetails.validationPipeline')}<Tag>{confidence.score}/100 {confidence.label}</Tag></Space>}
                                    description={(
                                      <Space direction="vertical" style={{ width: '100%' }}>
                                        {vuln.confidence_breakdown && Object.keys(vuln.confidence_breakdown).length > 0 && (
                                          <Row gutter={[8, 8]}>
                                            {Object.entries(vuln.confidence_breakdown).map(([key, value]) => (
                                              <Col key={key} xs={12} md={8}><Text>{key.replace(/_/g, ' ')}: <Text code>{Number(value) > 0 ? '+' : ''}{String(value)}</Text></Text></Col>
                                            ))}
                                          </Row>
                                        )}
                                        {vuln.proof_of_execution && <Text><CheckCircleOutlined /> {vuln.proof_of_execution}</Text>}
                                        {vuln.negative_controls && <Text><SafetyCertificateOutlined /> {vuln.negative_controls}</Text>}
                                      </Space>
                                    )}
                                  />
                                )}

                                {vuln.description && <ProCard title={t('scanDetails.description')} bordered><Paragraph>{vuln.description}</Paragraph></ProCard>}
                                {vuln.impact && <ProCard title={t('scanDetails.impact')} bordered><Paragraph>{vuln.impact}</Paragraph></ProCard>}
                                {(vuln.poc_request || vuln.poc_payload || vuln.poc_response) && (
                                  <ProCard title={t('scanDetails.proofOfConcept')} bordered extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(vuln.poc_request || vuln.poc_payload || '')}>{t('scanDetails.copy')}</Button>}>
                                    <Space direction="vertical" style={{ width: '100%' }}>
                                      {vuln.poc_payload && <ProCard title={t('scanDetails.payload')} type="inner"><CodeBlock value={vuln.poc_payload} /></ProCard>}
                                      {vuln.poc_request && <ProCard title={t('scanDetails.request')} type="inner"><CodeBlock value={vuln.poc_request} /></ProCard>}
                                      {vuln.poc_response && <ProCard title={t('scanDetails.response')} type="inner"><CodeBlock value={vuln.poc_response} /></ProCard>}
                                    </Space>
                                  </ProCard>
                                )}
                                {vuln.poc_code && <ProCard title={t('scanDetails.exploitationCode')} bordered><CodeBlock value={vuln.poc_code} /></ProCard>}
                                {vuln.remediation && <ProCard title={t('scanDetails.remediation')} bordered><Paragraph>{vuln.remediation}</Paragraph></ProCard>}
                                {vuln.ai_analysis && <ProCard title={t('scanDetails.aiAnalysis')} bordered><Paragraph style={{ whiteSpace: 'pre-wrap' }}>{vuln.ai_analysis}</Paragraph></ProCard>}
                                {vuln.validation_status === 'ai_rejected' && vuln.ai_rejection_reason && <Alert showIcon type="warning" message={t('scanDetails.aiRejectionReason')} description={vuln.ai_rejection_reason} />}

                                {vuln.validation_status !== 'validated' && vuln.validation_status !== 'false_positive' && (
                                  <Space wrap>
                                    <Text type="secondary">{t('scanDetails.manualReview')}:</Text>
                                    <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={async event => {
                                      event.stopPropagation()
                                      try {
                                        await vulnerabilitiesApi.validate(vuln.id, 'validated')
                                        setVulnerabilities(vulnerabilities.map(item => item.id === vuln.id ? { ...item, validation_status: 'validated' as const } : item))
                                        addToast(t('scanDetails.findingValidated'), 'completed')
                                      } catch (err) { console.error('Validate error:', err) }
                                    }}>{t('scanDetails.validate')}</Button>
                                    <Button size="small" icon={<CloseCircleOutlined />} onClick={event => {
                                      event.stopPropagation()
                                      setFeedbackVulnId(vuln.id); setFeedbackIsTp(false); setFeedbackText(''); setLearningPatternCount(null)
                                    }}>{t('scanDetails.falsePositive')}</Button>
                                    <Button size="small" icon={<CheckOutlined />} onClick={event => {
                                      event.stopPropagation()
                                      setFeedbackVulnId(vuln.id); setFeedbackIsTp(true); setFeedbackText(''); setLearningPatternCount(null)
                                    }}>{t('scanDetails.confirmTp')}</Button>
                                    {vuln.validation_status === 'ai_rejected' && <Text type="warning">{t('scanDetails.aiRejectedReview')}</Text>}
                                  </Space>
                                )}

                                {(vuln.validation_status === 'validated' || vuln.validation_status === 'false_positive') && (
                                  <Space>
                                    <Text type="secondary">{vuln.validation_status === 'validated' ? t('scanDetails.manuallyValidated') : t('scanDetails.markedAsFalsePositive')}</Text>
                                    <Button size="small" type="link" onClick={async event => {
                                      event.stopPropagation()
                                      try {
                                        const revertTo = vuln.ai_rejection_reason ? 'ai_rejected' : 'ai_confirmed'
                                        await vulnerabilitiesApi.validate(vuln.id, revertTo)
                                        setVulnerabilities(vulnerabilities.map(item => item.id === vuln.id ? { ...item, validation_status: revertTo as Vulnerability['validation_status'] } : item))
                                      } catch (err) { console.error('Revert error:', err) }
                                    }}>{t('scanDetails.undo')}</Button>
                                  </Space>
                                )}

                                {vuln.references?.length > 0 && (
                                  <ProCard title={t('scanDetails.references')} bordered>
                                    <Space wrap>
                                      {vuln.references.map((ref, refIndex) => (
                                        <a key={refIndex} href={ref} target="_blank" rel="noopener noreferrer">
                                          <Space>{(() => { try { return new URL(ref).hostname } catch { return ref } })()}<LinkOutlined /></Space>
                                        </a>
                                      ))}
                                    </Space>
                                  </ProCard>
                                )}
                              </Space>
                            )}
                          </Card>
                        )
                      }}
                    />
                  )}
                </Space>
              ),
            },
            {
              key: 'endpoints',
              label: <Space><GlobalOutlined />{t('scanDetails.endpoints')}<Badge count={endpoints.length} size="small" /></Space>,
              children: <ProTable<Endpoint> rowKey={(row, index) => row.id || `${row.method}-${row.path || row.url}-${index}`} search={false} options={false} columns={endpointColumns} dataSource={endpoints} pagination={{ pageSize: 10 }} headerTitle={t('scanDetails.discoveredEndpoints')} />,
            },
            {
              key: 'tasks',
              label: <Space><RobotOutlined />{t('scanDetails.agentTasks')}<Badge count={agentTasks.length} size="small" /></Space>,
              children: <ProTable<ScanAgentTask> rowKey={(row, index) => row.id || `task-${index}`} search={false} options={false} columns={taskColumns} dataSource={agentTasks} pagination={{ pageSize: 10 }} expandable={{ expandedRowRender: row => <Space direction="vertical" style={{ width: '100%' }}>{row.result_summary && <Text>{row.result_summary}</Text>}{row.error_message && <Alert showIcon type="error" message={t('scanDetails.error')} description={row.error_message} />}</Space> }} headerTitle={`${agentTasks.length} ${t('scanDetails.tasksExecuted')}`} />,
            },
            {
              key: 'logs',
              label: <Space><ProfileOutlined />{t('scanDetails.activityLog')}<Badge count={displayLogs.length} size="small" /></Space>,
              children: <LogViewer logs={displayLogs} logFilter={logFilter} setLogFilter={setLogFilter} logSearch={logSearch} setLogSearch={setLogSearch} t={t} />,
            },
          ]}
        />
      </Space>

      <Modal
        open={showReportModelPicker}
        title={t('scanDetails.aiReport')}
        onCancel={() => setShowReportModelPicker(false)}
        onOk={handleGenerateAiReport}
        confirmLoading={isGeneratingAiReport}
        okText={t('scanDetails.generateAiReport')}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            allowClear
            style={{ width: '100%' }}
            placeholder={t('scanDetails.provider')}
            value={reportProvider || undefined}
            options={providerOptions}
            onChange={value => { setReportProvider(value || ''); setReportModel('') }}
          />
          <Select
            allowClear
            showSearch
            style={{ width: '100%' }}
            placeholder={t('scanDetails.model')}
            value={reportModel || undefined}
            options={modelOptions}
            onChange={value => setReportModel(value || '')}
          />
        </Space>
      </Modal>

      <Modal
        open={Boolean(feedbackVulnId)}
        title={feedbackIsTp ? t('scanDetails.confirmTruePositive') : t('scanDetails.reportFalsePositive')}
        onCancel={() => setFeedbackVulnId(null)}
        okButtonProps={{ disabled: !feedbackIsTp && feedbackText.length < 3, danger: !feedbackIsTp }}
        confirmLoading={feedbackSubmitting}
        okText={feedbackIsTp ? t('scanDetails.confirmTruePositive') : t('scanDetails.submit')}
        onOk={async () => {
          if (!feedbackVulnId || (!feedbackIsTp && feedbackText.length < 3)) return
          setFeedbackSubmitting(true)
          try {
            const result = await vulnerabilitiesApi.submitFeedback(feedbackVulnId, feedbackIsTp, feedbackText)
            setLearningPatternCount(result.pattern_count)
            const newStatus = feedbackIsTp ? 'validated' : 'false_positive'
            setVulnerabilities(vulnerabilities.map(v => v.id === feedbackVulnId ? { ...v, validation_status: newStatus as Vulnerability['validation_status'] } : v))
            addToast(feedbackIsTp ? t('scanDetails.confirmTruePositive') : t('scanDetails.reportFalsePositive'), 'completed')
            setTimeout(() => setFeedbackVulnId(null), 1500)
          } catch (err) { console.error('Feedback error:', err) }
          finally { setFeedbackSubmitting(false) }
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">{feedbackIsTp ? t('scanDetails.optionalExplain') : t('scanDetails.requiredExplain')}</Text>
          <TextArea
            rows={4}
            value={feedbackText}
            onChange={event => setFeedbackText(event.target.value)}
            placeholder={feedbackIsTp ? t('scanDetails.optionalExplain') : t('scanDetails.requiredExplain')}
          />
          {learningPatternCount !== null && <Alert type="info" showIcon message={t('scanDetails.patternsLearned', { count: learningPatternCount })} />}
        </Space>
      </Modal>
    </PageContainer>
  )
}
