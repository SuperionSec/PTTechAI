import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Collapse,
  Descriptions,
  Dropdown,
  Empty,
  Input,
  Popconfirm,
  Progress,
  Row,
  Col,
  Space,
  Steps,
  Switch,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  BranchesOutlined,
  BugOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DownloadOutlined,
  FileTextOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  StopOutlined,
  ThunderboltOutlined,
  WifiOutlined,
} from '@ant-design/icons'
import { agentApi, reportsApi } from '../services/api'
import type { AgentFinding, AgentLog, AgentStatus } from '../types'
import { relativeTime } from '../utils/time'
import { isLogContainerNearBottom } from '../utils/logScroll'

const { Paragraph, Text } = Typography
const { TextArea } = Input

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const PHASE_KEYS = ['recon', 'analysis', 'testing', 'enhancement', 'completed']

const severityColor: Record<Severity, string> = {
  critical: 'red',
  high: 'volcano',
  medium: 'orange',
  low: 'blue',
  info: 'default',
}

const statusColor: Record<AgentStatus['status'], 'processing' | 'warning' | 'success' | 'error' | 'default'> = {
  running: 'processing',
  paused: 'warning',
  completed: 'success',
  error: 'error',
  stopped: 'default',
}

function getScanPhases(t: (key: string) => string) {
  return [
    { key: 'recon', title: t('agent.reconnaissance'), icon: <ApiOutlined /> },
    { key: 'analysis', title: t('agent.analysis'), icon: <RobotOutlined /> },
    { key: 'testing', title: t('agent.testing'), icon: <SafetyCertificateOutlined /> },
    { key: 'enhancement', title: t('agent.enhancement'), icon: <ThunderboltOutlined /> },
    { key: 'completed', title: t('agent.completed'), icon: <CheckCircleOutlined /> },
  ]
}

function getModeLabels(t: (key: string) => string): Record<string, string> {
  return {
    full_auto: t('agent.fullAuto'),
    recon_only: t('agent.reconOnly'),
    prompt_only: t('agent.promptOnly'),
    analyze_only: t('agent.analyzeOnly'),
    auto_pentest: t('autoPentest.title'),
  }
}

function getPhaseIndex(phase: string): number {
  const p = phase.toLowerCase()
  if (p.includes('recon') || p.includes('initializing')) return 0
  if (p.includes('analysis') || p.includes('attack surface')) return 1
  if (p.includes('test') || p.includes('vuln')) return 2
  if (p.includes('enhance') || p.includes('finding')) return 3
  if (p.includes('complete') || p.includes('report')) return 4
  return 0
}

function formatStatusLabel(status: AgentStatus['status'], t: (key: string) => string) {
  const labels: Record<AgentStatus['status'], string> = {
    running: t('agent.statusRunning'),
    paused: t('agent.statusPaused'),
    completed: t('agent.statusCompleted'),
    error: t('agent.statusError'),
    stopped: t('agent.statusStopped'),
  }
  return labels[status]
}

function confidenceColor(score?: number) {
  if (typeof score !== 'number') return 'default'
  if (score >= 90) return 'green'
  if (score >= 60) return 'orange'
  return 'red'
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildReportHtml(status: AgentStatus, agentId: string | undefined, modeLabel: string) {
  const sorted = [...status.findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
  const counts = SEVERITY_ORDER.reduce<Record<Severity, number>>((acc, severity) => {
    acc[severity] = sorted.filter(finding => finding.severity === severity).length
    return acc
  }, { critical: 0, high: 0, medium: 0, low: 0, info: 0 })
  const riskScore = Math.min(100, counts.critical * 25 + counts.high * 15 + counts.medium * 8 + counts.low * 3)
  const findingsHtml = sorted.map((finding, index) => `
    <section class="finding severity-${finding.severity}">
      <div class="finding-header">
        <span class="badge">${escapeHtml(finding.severity.toUpperCase())}</span>
        <span>Finding #${index + 1}</span>
      </div>
      <h2>${escapeHtml(finding.title)}</h2>
      <p class="endpoint">${escapeHtml(finding.affected_endpoint)}</p>
      ${finding.cvss_score ? `<p><strong>CVSS:</strong> ${escapeHtml(finding.cvss_score)}</p>` : ''}
      ${finding.cwe_id ? `<p><strong>CWE:</strong> ${escapeHtml(finding.cwe_id)}</p>` : ''}
      ${finding.parameter ? `<p><strong>Parameter:</strong> <code>${escapeHtml(finding.parameter)}</code></p>` : ''}
      ${finding.description ? `<h3>Description</h3><p>${escapeHtml(finding.description)}</p>` : ''}
      ${finding.evidence ? `<h3>Evidence</h3><pre>${escapeHtml(finding.evidence)}</pre>` : ''}
      ${finding.payload ? `<h3>Payload</h3><pre>${escapeHtml(finding.payload)}</pre>` : ''}
      ${finding.request ? `<h3>HTTP Request</h3><pre>${escapeHtml(finding.request)}</pre>` : ''}
      ${finding.response ? `<h3>HTTP Response</h3><pre>${escapeHtml(finding.response)}</pre>` : ''}
      ${finding.impact ? `<h3>Impact</h3><p>${escapeHtml(finding.impact)}</p>` : ''}
      ${finding.poc_code ? `<h3>Proof of Concept</h3><pre>${escapeHtml(finding.poc_code)}</pre>` : ''}
      ${finding.proof_of_execution ? `<h3>Proof of Execution</h3><p>${escapeHtml(finding.proof_of_execution)}</p>` : ''}
      ${finding.remediation ? `<h3>Remediation</h3><p>${escapeHtml(finding.remediation)}</p>` : ''}
      ${finding.references?.length ? `<h3>References</h3><ul>${finding.references.map(ref => `<li>${escapeHtml(ref)}</li>`).join('')}</ul>` : ''}
    </section>`).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>PTTechAI Security Report - ${escapeHtml(status.target)}</title>
<style>
body{margin:0;background:#0f172a;color:#e2e8f0;font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.65}.page{max-width:1100px;margin:0 auto;padding:42px 28px}.hero,.panel,.finding{background:#111827;border:1px solid #263244;border-radius:14px;padding:26px;margin-bottom:22px}h1,h2,h3{color:#f8fafc}.meta{color:#94a3b8}.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}.stat{background:#020617;border:1px solid #263244;border-radius:10px;padding:16px;text-align:center}.num{font-size:30px;font-weight:700}.risk{font-size:52px;font-weight:800;color:#f97316}.badge{display:inline-block;border-radius:999px;padding:3px 10px;background:#334155;color:#fff;font-size:12px;font-weight:700}.endpoint,code,pre{font-family:SFMono-Regular,Consolas,monospace}pre{white-space:pre-wrap;word-break:break-word;background:#020617;border:1px solid #263244;border-radius:8px;padding:14px;color:#d1d5db}.severity-critical{border-left:4px solid #ef4444}.severity-high{border-left:4px solid #f97316}.severity-medium{border-left:4px solid #f59e0b}.severity-low{border-left:4px solid #3b82f6}.severity-info{border-left:4px solid #64748b}@media print{body{background:#fff;color:#111827}.hero,.panel,.finding{background:#fff;color:#111827;border-color:#d1d5db}h1,h2,h3{color:#111827}pre{background:#f8fafc;color:#111827}}
</style>
</head>
<body><main class="page">
<section class="hero"><p class="meta">Confidential Security Report</p><h1>Penetration Test Report</h1><p>Target: <code>${escapeHtml(status.target)}</code></p><p class="meta">Agent: ${escapeHtml(agentId)} · Mode: ${escapeHtml(modeLabel)} · Generated: ${new Date().toISOString()}</p></section>
<section class="panel"><h2>Risk Overview</h2><div class="risk">${riskScore}</div><div class="grid"><div class="stat"><div class="num">${sorted.length}</div><div>Total</div></div>${SEVERITY_ORDER.map(severity => `<div class="stat"><div class="num">${counts[severity]}</div><div>${severity}</div></div>`).join('')}</div></section>
<section class="panel"><h2>Executive Summary</h2><p>The assessment against <strong>${escapeHtml(status.target)}</strong> identified <strong>${sorted.length}</strong> finding(s). Critical and high severity findings should be prioritized for remediation.</p></section>
${findingsHtml || '<section class="panel"><h2>No Findings</h2><p>No vulnerabilities were identified during this assessment.</p></section>'}
</main></body></html>`
}

export default function AgentStatusPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const scriptLogsContainerRef = useRef<HTMLDivElement>(null)
  const llmLogsContainerRef = useRef<HTMLDivElement>(null)
  const scriptStickRef = useRef(true)
  const llmStickRef = useRef(true)
  const consecutiveErrorsRef = useRef(0)

  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [isGeneratingAiReport, setIsGeneratingAiReport] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [connectionLost, setConnectionLost] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [skippedPhases, setSkippedPhases] = useState<Set<string>>(new Set())

  const scanPhases = useMemo(() => getScanPhases(t), [t])
  const modeLabels = useMemo(() => getModeLabels(t), [t])

  const scriptLogs = useMemo(
    () => logs.filter(log => log.source === 'script' || (!log.source && !log.message.includes('[LLM]') && !log.message.includes('[AI]'))),
    [logs],
  )
  const llmLogs = useMemo(
    () => logs.filter(log => log.source === 'llm' || log.message.includes('[LLM]') || log.message.includes('[AI]')),
    [logs],
  )
  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    status?.findings.forEach(finding => { counts[finding.severity] += 1 })
    return counts
  }, [status])

  const fetchStatus = useCallback(async () => {
    if (!agentId) return
    try {
      const [statusData, logsData] = await Promise.all([
        agentApi.getStatus(agentId),
        agentApi.getLogs(agentId, 500),
      ])
      setStatus(statusData)
      setLogs(logsData.logs || [])
      setError(null)
      if (consecutiveErrorsRef.current >= 3) {
        notification.success({ message: t('agent.connectionRestored') })
      }
      consecutiveErrorsRef.current = 0
      setConnectionLost(false)
    } catch (err: unknown) {
      const apiErr = err as { response?: { status?: number } }
      if (apiErr.response?.status === 404) {
        setError(t('agent.agentNotFound'))
      } else {
        consecutiveErrorsRef.current += 1
        if (consecutiveErrorsRef.current >= 3) setConnectionLost(true)
      }
    } finally {
      setIsLoading(false)
    }
  }, [agentId, notification, t])

  useEffect(() => {
    if (!agentId) return
    fetchStatus()
    const interval = window.setInterval(() => {
      if (status?.status === 'running' || status?.status === 'paused') fetchStatus()
    }, 5000)
    return () => window.clearInterval(interval)
  }, [agentId, fetchStatus, status?.status])

  useEffect(() => {
    if (!autoScroll) return
    if (scriptStickRef.current && scriptLogsContainerRef.current) scriptLogsContainerRef.current.scrollTop = scriptLogsContainerRef.current.scrollHeight
    if (llmStickRef.current && llmLogsContainerRef.current) llmLogsContainerRef.current.scrollTop = llmLogsContainerRef.current.scrollHeight
  }, [logs, autoScroll])

  useEffect(() => {
    if (!status) return
    const phase = status.phase.toLowerCase()
    if (phase.includes('_skipped')) {
      setSkippedPhases(prev => new Set(prev).add(phase.replace('_skipped', '')))
    }
  }, [status])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchStatus()
    setRefreshing(false)
    notification.info({ message: t('agent.statusRefreshed') })
  }, [fetchStatus, notification, t])

  const copyToClipboard = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    notification.success({ message: t('agent.copiedToClipboard') })
  }, [notification, t])

  const generateReportData = useCallback(() => {
    if (!status) return null
    return {
      report_info: {
        agent_id: agentId,
        target: status.target,
        mode: status.mode,
        status: status.status,
        started_at: status.started_at,
        completed_at: status.completed_at || new Date().toISOString(),
        total_findings: status.findings.length,
        severity_breakdown: severityCounts,
      },
      findings: status.findings,
      logs: logs.slice(-100),
    }
  }, [agentId, logs, severityCounts, status])

  const downloadBlob = useCallback((content: BlobPart, type: string, fileName: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleGenerateReport = useCallback(async (format: 'json' | 'html') => {
    if (!status) return
    setIsGeneratingReport(true)
    try {
      const date = new Date().toISOString().split('T')[0]
      if (format === 'html') {
        downloadBlob(buildReportHtml(status, agentId, modeLabels[status.mode] || status.mode), 'text/html', `pttechai-report-${agentId}-${date}.html`)
        notification.success({ message: t('agent.htmlReportDownloaded') })
      } else {
        const reportData = status.report || generateReportData()
        downloadBlob(JSON.stringify(reportData, null, 2), 'application/json', `pttechai-report-${agentId}-${date}.json`)
        notification.success({ message: t('agent.jsonReportDownloaded') })
      }
    } finally {
      setIsGeneratingReport(false)
    }
  }, [agentId, downloadBlob, generateReportData, modeLabels, notification, status, t])

  const handleGenerateAiReport = useCallback(async () => {
    if (!status?.scan_id) return
    setIsGeneratingAiReport(true)
    try {
      const report = await reportsApi.generateAiReport({ scan_id: status.scan_id, title: `AI Report - ${status.target || 'Agent Scan'}` })
      window.open(reportsApi.getViewUrl(report.id), '_blank')
      notification.success({ message: t('agent.aiReportGenerated') })
    } catch (err) {
      console.error('Failed to generate AI report:', err)
      notification.error({ message: t('agent.failedToGenerateReport') })
    } finally {
      setIsGeneratingAiReport(false)
    }
  }, [notification, status, t])

  const handleStopScan = useCallback(async () => {
    if (!agentId) return
    setIsStopping(true)
    try {
      await agentApi.stop(agentId)
      await fetchStatus()
      notification.info({ message: t('agent.agentStopped') })
    } catch (err) {
      console.error('Failed to stop agent:', err)
      notification.error({ message: t('agent.failedToStopAgent') })
    } finally {
      setIsStopping(false)
    }
  }, [agentId, fetchStatus, notification, t])

  const handlePauseScan = useCallback(async () => {
    if (!agentId) return
    try {
      await agentApi.pause(agentId)
      await fetchStatus()
      notification.info({ message: t('agent.agentPaused') })
    } catch (err) {
      console.error('Failed to pause agent:', err)
      notification.error({ message: t('agent.failedToPauseAgent') })
    }
  }, [agentId, fetchStatus, notification, t])

  const handleResumeScan = useCallback(async () => {
    if (!agentId) return
    try {
      await agentApi.resume(agentId)
      await fetchStatus()
      notification.success({ message: t('agent.agentResumed') })
    } catch (err) {
      console.error('Failed to resume agent:', err)
      notification.error({ message: t('agent.failedToResumeAgent') })
    }
  }, [agentId, fetchStatus, notification, t])

  const handleSubmitPrompt = useCallback(async () => {
    if (!customPrompt.trim() || !agentId) return
    setIsSubmittingPrompt(true)
    try {
      const sentPrompt = customPrompt
      await agentApi.sendPrompt(agentId, customPrompt)
      setCustomPrompt('')
      notification.success({ message: t('agent.promptSent', { preview: `${sentPrompt.slice(0, 50)}${sentPrompt.length > 50 ? '...' : ''}` }) })
      await fetchStatus()
    } catch (err) {
      console.error('Failed to send prompt:', err)
      notification.error({ message: t('agent.failedToSendPrompt') })
    } finally {
      setIsSubmittingPrompt(false)
    }
  }, [agentId, customPrompt, fetchStatus, notification, t])

  const handleSkipToPhase = useCallback(async (targetPhase: string) => {
    if (!agentId) return
    setIsSkipping(true)
    try {
      await agentApi.skipToPhase(agentId, targetPhase)
      const currentIndex = status ? getPhaseIndex(status.phase) : 0
      const targetIndex = PHASE_KEYS.indexOf(targetPhase)
      setSkippedPhases(prev => {
        const next = new Set(prev)
        for (let index = currentIndex; index < targetIndex; index += 1) next.add(PHASE_KEYS[index])
        return next
      })
      notification.info({ message: t('agent.skippedToPhase', { phase: scanPhases.find(phase => phase.key === targetPhase)?.title || targetPhase }) })
      await fetchStatus()
    } catch (err) {
      console.error('Failed to skip phase:', err)
      notification.error({ message: t('agent.failedToSkipPhase') })
    } finally {
      setIsSkipping(false)
    }
  }, [agentId, fetchStatus, notification, scanPhases, status, t])

  const renderLogViewer = useCallback((items: AgentLog[], ref: React.RefObject<HTMLDivElement>, stickRef: React.MutableRefObject<boolean>, emptyText: string, icon: ReactNode) => (
    <div
      ref={ref}
      onScroll={() => {
        const element = ref.current
        if (element) stickRef.current = isLogContainerNearBottom(element)
      }}
      style={{ maxHeight: 420, overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 12 }}
    >
      {items.length ? (
        <Timeline
          items={items.map((log, index) => ({
            color: log.level === 'error' ? 'red' : log.level === 'warning' ? 'orange' : log.level === 'success' ? 'green' : log.level === 'llm' ? 'purple' : 'blue',
            children: (
              <Space key={index} direction="vertical" size={2} style={{ width: '100%' }}>
                <Text type="secondary">{new Date(log.time).toLocaleTimeString()}</Text>
                <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.message}</Text>
              </Space>
            ),
          }))}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Space>{icon}{emptyText}</Space>} />
      )}
    </div>
  ), [])

  const renderFindingDetails = useCallback((finding: AgentFinding) => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} bordered>
        <Descriptions.Item label="CVSS">{finding.cvss_score?.toFixed?.(1) || 'N/A'}</Descriptions.Item>
        <Descriptions.Item label="CWE">{finding.cwe_id || 'N/A'}</Descriptions.Item>
        <Descriptions.Item label={t('agent.confidence')}>{finding.confidence || finding.confidence_score || 'N/A'}</Descriptions.Item>
        <Descriptions.Item label={t('agent.endpointLabel')} span={3}>{finding.affected_endpoint || 'N/A'}</Descriptions.Item>
        {finding.parameter && <Descriptions.Item label={t('agent.vulnerableParameter')} span={3}>{finding.parameter}</Descriptions.Item>}
      </Descriptions>

      {finding.cvss_vector && <Alert type="info" showIcon message="CVSS Vector" description={<Text code>{finding.cvss_vector}</Text>} />}
      {finding.description && <Card size="small" title={t('agent.description')}><Paragraph>{finding.description}</Paragraph></Card>}
      {finding.evidence && <Card size="small" title={t('agent.evidenceLabel')}><Paragraph copyable>{finding.evidence}</Paragraph></Card>}
      {finding.payload && <Card size="small" title={t('agent.payloadUsed')}><Paragraph code copyable>{finding.payload}</Paragraph></Card>}
      {finding.request && <Card size="small" title={t('agent.httpRequest')}><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{finding.request}</pre></Card>}
      {finding.response && <Card size="small" title={t('agent.httpResponseExcerpt')}><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{finding.response}</pre></Card>}
      {finding.impact && <Alert type="warning" showIcon message={t('agent.impact')} description={finding.impact} />}
      {finding.poc_code && <Card size="small" title={t('agent.proofOfConcept')} extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(finding.poc_code)}>{t('agent.copy')}</Button>}><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{finding.poc_code}</pre></Card>}
      {finding.proof_of_execution && <Alert type="success" showIcon message={t('agent.proofOfExecution')} description={finding.proof_of_execution} />}
      {finding.remediation && <Alert type="success" showIcon message={t('agent.remediation')} description={finding.remediation} />}
      {finding.confidence_breakdown && Object.keys(finding.confidence_breakdown).length > 0 && (
        <Card size="small" title={t('agent.confidenceBreakdown')}>
          <Space wrap>{Object.entries(finding.confidence_breakdown).map(([key, value]) => <Tag key={key}>{key.replace(/_/g, ' ')}: {value > 0 ? '+' : ''}{value}</Tag>)}</Space>
        </Card>
      )}
      {finding.references?.length > 0 && (
        <Card size="small" title={t('agent.references')}>
          <Space direction="vertical">{finding.references.map(ref => <Text key={ref} copyable>{ref}</Text>)}</Space>
        </Card>
      )}
    </Space>
  ), [copyToClipboard, t])

  if (isLoading) {
    return <PageContainer><ProCard><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.loading')} /></ProCard></PageContainer>
  }

  if (error) {
    return (
      <PageContainer>
        <Alert type="error" showIcon message={error} action={<Button onClick={() => navigate('/scan/new')}>{t('agent.startNewAgent')}</Button>} />
      </PageContainer>
    )
  }

  if (!status) return null

  const currentPhaseIndex = status.status === 'completed' ? 4 : getPhaseIndex(status.phase)
  const reportMenu = {
    items: [
      { key: 'html', icon: <FileTextOutlined />, label: t('agent.htmlReport') },
      { key: 'json', icon: <DownloadOutlined />, label: t('agent.jsonReport') },
      ...(status.scan_id ? [{ key: 'ai', icon: <ThunderboltOutlined />, label: t('agent.aiReport') }] : []),
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'ai') handleGenerateAiReport()
      else handleGenerateReport(key as 'json' | 'html')
    },
  }

  const canExport = status.findings.length > 0 || !!status.report
  const findingItems = status.findings.map(finding => ({
    key: finding.id,
    label: (
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        <Space wrap>
          <Tag color={severityColor[finding.severity]}>{finding.severity.toUpperCase()}</Tag>
          {finding.ai_verified && <Tag color="purple" icon={<RobotOutlined />}>{t('agent.aiVerified')}</Tag>}
          {typeof finding.confidence_score === 'number' && <Tag color={confidenceColor(finding.confidence_score)}>{finding.confidence_score}/100</Tag>}
          <Text strong>{finding.title}</Text>
        </Space>
        <Text type="secondary" ellipsis>{finding.affected_endpoint}</Text>
      </Space>
    ),
    children: renderFindingDetails(finding),
  }))

  return (
    <PageContainer
      title={<Space><RobotOutlined />{t('agent.agentHeading', { id: agentId })}</Space>}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh}>{t('common.refresh')}</Button>,
        status.status === 'running' && <Button key="pause" icon={<PauseCircleOutlined />} onClick={handlePauseScan}>{t('agent.pause')}</Button>,
        status.status === 'paused' && <Button key="resume" type="primary" icon={<PlayCircleOutlined />} onClick={handleResumeScan}>{t('agent.resume')}</Button>,
        (status.status === 'running' || status.status === 'paused') && (
          <Popconfirm key="stop" title={t('agent.stop')} onConfirm={handleStopScan} okButtonProps={{ loading: isStopping }}>
            <Button danger icon={<StopOutlined />}>{t('agent.stop')}</Button>
          </Popconfirm>
        ),
        status.scan_id && <Button key="scan" icon={<SafetyCertificateOutlined />} onClick={() => navigate(`/scan/${status.scan_id}`)}>{t('agent.viewInDashboard')}</Button>,
        canExport && <Dropdown key="report" menu={reportMenu} disabled={isGeneratingReport || isGeneratingAiReport}><Button type="primary" icon={<DownloadOutlined />} loading={isGeneratingReport || isGeneratingAiReport}>{t('agent.generateReport')}</Button></Dropdown>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {connectionLost && <Alert type="warning" showIcon icon={<WifiOutlined />} message={t('agent.connectionIssuesRetrying')} />}
        {status.error && <Alert type="error" showIcon message={t('agent.agentErrorTitle')} description={status.error} />}

        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: t('agent.target'), value: status.target, icon: <ApiOutlined /> }} />
          <StatisticCard statistic={{ title: t('agent.mode'), value: modeLabels[status.mode] || status.mode, icon: <BranchesOutlined /> }} />
          <StatisticCard statistic={{ title: t('agent.totalFindingsLabel'), value: status.findings_count, icon: <BugOutlined /> }} />
          <StatisticCard statistic={{ title: t('agent.status'), value: formatStatusLabel(status.status, t), icon: <Badge status={statusColor[status.status]} /> }} />
        </StatisticCard.Group>

        <ProCard bordered>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Row gutter={[16, 16]} align="middle">
              <Col flex="auto">
                <Space wrap>
                  <Tag color={statusColor[status.status]}>{formatStatusLabel(status.status, t)}</Tag>
                  <Text>{t('agent.phaseToast', { phase: status.phase.replace(/_/g, ' ') })}</Text>
                  {status.started_at && <Text type="secondary">{t('agent.started')} {relativeTime(status.started_at, t)}</Text>}
                  {status.task && <Text type="secondary">{t('agent.taskPrefix')} {status.task}</Text>}
                </Space>
              </Col>
              <Col><Text strong>{status.progress}%</Text></Col>
            </Row>
            <Progress percent={status.progress} status={status.status === 'error' ? 'exception' : status.status === 'completed' ? 'success' : 'active'} />
            <Steps
              current={currentPhaseIndex}
              items={scanPhases.map((phase, index) => ({
                title: skippedPhases.has(phase.key) ? t('agent.phaseSkipped', { label: phase.title }) : phase.title,
                icon: phase.icon,
                status: skippedPhases.has(phase.key) ? 'wait' : index < currentPhaseIndex || status.status === 'completed' ? 'finish' : index === currentPhaseIndex ? 'process' : 'wait',
                description: (status.status === 'running' || status.status === 'paused') && index > currentPhaseIndex && phase.key !== 'completed'
                  ? <Popconfirm title={t('agent.skipToConfirm', { label: phase.title })} onConfirm={() => handleSkipToPhase(phase.key)} okButtonProps={{ loading: isSkipping }}><Button size="small" type="link">{t('agent.skipToTooltip', { label: phase.title })}</Button></Popconfirm>
                  : undefined,
              }))}
            />
          </Space>
        </ProCard>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={4}><ProCard bordered><StatisticCard statistic={{ title: t('agent.totalFindingsShort'), value: status.findings_count }} /></ProCard></Col>
          {SEVERITY_ORDER.map(severity => (
            <Col key={severity} xs={12} sm={6} md={4}><ProCard bordered><StatisticCard statistic={{ title: severity, value: severityCounts[severity], status: severity === 'critical' || severity === 'high' ? 'error' : severity === 'medium' ? 'warning' : 'default' }} /></ProCard></Col>
          ))}
        </Row>

        {status.status === 'running' && (
          <ProCard bordered title={<Space><RobotOutlined />{t('agent.customAiPromptTitle')}</Space>}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">{t('agent.customAiPromptHelp')}</Text>
              <TextArea value={customPrompt} onChange={event => setCustomPrompt(event.target.value)} placeholder={t('agent.customPromptPlaceholder')} autoSize={{ minRows: 2, maxRows: 5 }} onPressEnter={event => { if (!event.shiftKey) { event.preventDefault(); handleSubmitPrompt() } }} />
              <Button type="primary" icon={<SendOutlined />} loading={isSubmittingPrompt} disabled={!customPrompt.trim()} onClick={handleSubmitPrompt}>{t('agent.send')}</Button>
            </Space>
          </ProCard>
        )}

        <Tabs
          items={[
            {
              key: 'findings',
              label: `${t('agent.vulnsFoundTitle')} (${status.findings_count})`,
              children: status.findings.length ? <Collapse items={findingItems} /> : <Empty description={status.status === 'running' ? t('agent.scanningForVulns') : t('agent.noVulnsFound')} />,
            },
            {
              key: 'logs',
              label: t('agentStatus.logs'),
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Row justify="end"><Space><Text type="secondary">{t('agent.autoScrollLogs')}</Text><Switch checked={autoScroll} onChange={setAutoScroll} /></Space></Row>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                      <ProCard bordered title={<Space><CodeOutlined />{t('agent.scriptActivity')}<Tag>{scriptLogs.length}</Tag></Space>} subTitle={t('agent.scriptActivitySubtitle')}>
                        {renderLogViewer(scriptLogs, scriptLogsContainerRef, scriptStickRef, t('agent.logEmptyScript'), <CodeOutlined />)}
                      </ProCard>
                    </Col>
                    <Col xs={24} lg={12}>
                      <ProCard bordered title={<Space><RobotOutlined />{t('agent.aiAnalysis')}<Tag>{llmLogs.length}</Tag></Space>} subTitle={t('agent.aiAnalysisSubtitle')}>
                        {renderLogViewer(llmLogs, llmLogsContainerRef, llmStickRef, t('agent.logEmptyAi'), <RobotOutlined />)}
                      </ProCard>
                    </Col>
                  </Row>
                </Space>
              ),
            },
            {
              key: 'report',
              label: t('agent.reportSummary'),
              children: (status.report || status.findings.length > 0) ? (
                <ProCard bordered>
                  <Descriptions bordered column={{ xs: 1, md: 2 }}>
                    <Descriptions.Item label={t('agent.target')}>{status.report?.summary.target || status.target}</Descriptions.Item>
                    <Descriptions.Item label={t('agent.mode')}>{modeLabels[status.report?.summary.mode || status.mode] || status.mode}</Descriptions.Item>
                    <Descriptions.Item label={t('agent.duration')}>{status.report?.summary.duration || 'N/A'}</Descriptions.Item>
                    <Descriptions.Item label={t('agent.totalFindingsShort')}>{status.report?.summary.total_findings || status.findings.length}</Descriptions.Item>
                  </Descriptions>
                  {status.report?.executive_summary && <Alert style={{ marginTop: 16 }} type="info" showIcon message={t('agent.executiveSummaryHeading')} description={status.report.executive_summary} />}
                  {status.report?.recommendations?.length ? <Card style={{ marginTop: 16 }} title={t('agent.recommendations')}>{status.report.recommendations.map(item => <Paragraph key={item}>{item}</Paragraph>)}</Card> : null}
                </ProCard>
              ) : <Empty description={t('agentStatus.noFindings')} />,
            },
            {
              key: 'details',
              label: t('agentStatus.title'),
              children: (
                <Descriptions bordered column={{ xs: 1, md: 2 }}>
                  <Descriptions.Item label="Agent ID">{agentId}</Descriptions.Item>
                  <Descriptions.Item label="Scan ID">{status.scan_id || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label={t('agentStatus.startTime')}>{status.started_at ? new Date(status.started_at).toLocaleString() : 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Completed">{status.completed_at ? new Date(status.completed_at).toLocaleString() : 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Logs">{status.logs_count}</Descriptions.Item>
                  <Descriptions.Item label="Rejected">{status.rejected_findings_count || 0}</Descriptions.Item>
                  <Descriptions.Item label={t('autoPentest.containerLabel')}>{status.container_status ? (status.container_status.online ? t('autoPentest.online') : t('autoPentest.offline')) : 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Container ID">{status.container_status?.container_id || 'N/A'}</Descriptions.Item>
                </Descriptions>
              ),
            },
          ]}
        />
      </Space>
    </PageContainer>
  )
}
