import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Crosshair, Shield, ChevronDown, ChevronUp, Loader2,
  AlertTriangle, CheckCircle2, Globe, Lock, Bug,
  FileText, ScrollText, X, ExternalLink, Download, Sparkles,
  Brain, Trash2, Clock, Search,
  Activity, Terminal
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { agentApi, reportsApi } from '../services/api'
import type { AgentStatus, AgentFinding, AgentLog, ToolExecution, ContainerStatus } from '../types'
import { isLogContainerNearBottom } from '../utils/logScroll'

// ─── Constants ────────────────────────────────────────────────────────────────

const getPhases = (t: any) => [
  { key: 'recon', label: t('fullIaTesting.aiRecon'), icon: Globe, range: [0, 25] as const },
  { key: 'testing', label: t('fullIaTesting.aiTesting'), icon: Bug, range: [25, 70] as const },
  { key: 'postexploit', label: t('fullIaTesting.postExploitation'), icon: Brain, range: [70, 85] as const },
  { key: 'report', label: t('fullIaTesting.report'), icon: Shield, range: [85, 100] as const },
]


const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500',
  low: 'bg-blue-500', info: 'bg-gray-500',
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-red-500/40', high: 'border-orange-500/40', medium: 'border-yellow-500/40',
  low: 'border-blue-500/40', info: 'border-gray-500/40',
}

const SEVERITY_CHART_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6', info: '#6b7280',
}

const CONFIDENCE_STYLES: Record<string, string> = {
  green: 'bg-green-500/15 text-green-400 border-green-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  red: 'bg-red-500/15 text-red-400 border-red-500/30',
}

const getLogFilters = (t: any) => [
  { key: 'all', label: t('fullIaTesting.all'), color: '' },
  { key: 'llm', label: t('fullIaTesting.llmPentest'), color: 'text-red-400' },
  { key: 'ai', label: t('fullIaTesting.aiDecisions'), color: 'text-purple-400' },
  { key: 'error', label: t('fullIaTesting.errors'), color: 'text-red-400' },
]

const SESSION_KEY = 'pttechai_fullia_session'
const POLL_INTERVAL = 1500
const POLL_INTERVAL_ERROR = 5000
const TOAST_DURATION = 5000
const MAX_TOASTS = 5

// ─── Utility Functions ────────────────────────────────────────────────────────

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

function logMessageColor(message: string): string {
  if (message.startsWith('[LLM PENTEST]')) return 'text-red-400'
  if (message.startsWith('[STREAM 1]')) return 'text-blue-400'
  if (message.startsWith('[STREAM 2]')) return 'text-purple-400'
  if (message.startsWith('[STREAM 3]')) return 'text-orange-400'
  if (message.startsWith('[TOOL]')) return 'text-orange-300'
  if (message.startsWith('[DEEP]')) return 'text-cyan-400'
  if (message.startsWith('[FINAL]')) return 'text-green-400'
  if (message.startsWith('[CONTAINER]')) return 'text-cyan-300'
  if (message.startsWith('[PHASE]')) return 'text-yellow-400'
  if (message.startsWith('[PHASE FAIL]')) return 'text-red-400'
  if (message.startsWith('[BANNER]')) return 'text-teal-400'
  if (message.startsWith('[WAF]')) return 'text-amber-400'
  if (message.startsWith('[PLAYBOOK]')) return 'text-indigo-400'
  if (message.startsWith('[SITE ANALYZER]')) return 'text-emerald-400'
  return ''
}

function matchLogFilter(log: AgentLog, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'llm') return log.message.startsWith('[LLM PENTEST]')
  if (filter === 'ai') return log.source === 'llm' || log.message.includes('[AI]') || log.message.includes('[LLM]')
  if (filter === 'error') return log.level === 'error' || log.level === 'warning'
  return true
}

function getConfidenceDisplay(finding: { confidence_score?: number; confidence?: string }, t?: any): { score: number; color: string; label: string } | null {
  let score: number | null = null
  if (typeof finding.confidence_score === 'number') {
    score = finding.confidence_score
  } else if (finding.confidence) {
    const parsed = Number(finding.confidence)
    if (!isNaN(parsed)) score = parsed
    else {
      const map: Record<string, number> = { high: 90, medium: 60, low: 30 }
      score = map[finding.confidence.toLowerCase()] ?? null
    }
  }
  if (score === null) return null
  const color = score >= 90 ? 'green' : score >= 60 ? 'yellow' : 'red'
  const label = t ? (score >= 90 ? t('fullIaTesting.confirmed') : score >= 60 ? t('fullIaTesting.likely') : t('fullIaTesting.low'))
    : (score >= 90 ? 'Confirmed' : score >= 60 ? 'Likely' : 'Low')
  return { score, color, label }
}

// ─── Toast Type ───────────────────────────────────────────────────────────────

interface Toast {
  id: string
  message: string
  severity: string
  timestamp: number
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function LiveStatsDashboard({ status, elapsedSeconds, toolExecutions, t }: {
  status: AgentStatus; elapsedSeconds: number; toolExecutions: ToolExecution[]; t: any
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-blue-400" />
          <span className="text-[10px] text-dark-400 uppercase font-semibold tracking-wider">{t('fullIaTesting.elapsed')}</span>
        </div>
        <span className="text-2xl font-mono text-white tabular-nums">{formatElapsed(elapsedSeconds)}</span>
      </div>
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Bug className="w-4 h-4 text-red-400" />
          <span className="text-[10px] text-dark-400 uppercase font-semibold tracking-wider">{t('fullIaTesting.findings')}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono text-white">{status.findings_count}</span>
          {(status.rejected_findings_count ?? 0) > 0 && (
            <span className="text-xs text-dark-500">+{status.rejected_findings_count} {t('fullIaTesting.rej')}</span>
          )}
        </div>
      </div>
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] text-dark-400 uppercase font-semibold tracking-wider">{t('fullIaTesting.toolsRun')}</span>
        </div>
        <span className="text-2xl font-mono text-white">{toolExecutions.length}</span>
      </div>
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-green-400" />
          <span className="text-[10px] text-dark-400 uppercase font-semibold tracking-wider">{t('fullIaTesting.progress')}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono text-white">{status.progress}%</span>
          <span className="text-xs text-dark-500 truncate">{status.phase || t('fullIaTesting.init')}</span>
        </div>
      </div>
    </div>
  )
}

function ToolExecutionRow({ exec, expanded, onToggle, t }: {
  exec: ToolExecution; expanded: boolean; onToggle: () => void; t: any
}) {
  const hasExpandable = !!(exec.stdout_preview || exec.stderr_preview || exec.reason)
  return (
    <div className="border-b border-dark-800 last:border-0">
      <button
        onClick={hasExpandable ? onToggle : undefined}
        className={`w-full grid grid-cols-[50px_70px_1fr_50px_65px_55px_20px] sm:grid-cols-[60px_80px_1fr_50px_70px_60px_24px] gap-2 items-center px-2 py-2 text-xs transition-colors ${
          hasExpandable ? 'hover:bg-dark-700/50 cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className="font-mono text-dark-500 truncate">{exec.task_id?.slice(0, 6) || '---'}</span>
        <span className="text-cyan-400 font-medium truncate">{exec.tool}</span>
        <span className="text-dark-300 truncate text-left" title={exec.command}>{exec.command}</span>
        <span className={`font-bold text-center ${exec.exit_code === 0 ? 'text-green-400' : exec.exit_code !== null ? 'text-red-400' : 'text-dark-500'}`}>
          {exec.exit_code ?? '...'}
        </span>
        <span className="text-dark-400 text-right">{exec.duration !== null ? `${exec.duration.toFixed(1)}s` : '---'}</span>
        <span className="text-dark-300 text-center">{exec.findings_count ?? 0}</span>
        <span className="text-dark-500">
          {hasExpandable ? (expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 bg-dark-900/50 border-t border-dark-800">
          {exec.reason && (
            <p className="text-xs text-dark-400 pt-2"><span className="text-dark-500 font-medium">{t('fullIaTesting.reason')}: </span>{exec.reason}</p>
          )}
          {exec.stdout_preview && (
            <div>
              <p className="text-[10px] font-medium text-dark-500 mb-1 uppercase tracking-wider">stdout</p>
              <pre className="bg-dark-950 rounded p-2 text-xs text-green-400/80 max-h-[200px] overflow-y-auto whitespace-pre-wrap font-mono">{exec.stdout_preview}</pre>
            </div>
          )}
          {exec.stderr_preview && (
            <div>
              <p className="text-[10px] font-medium text-dark-500 mb-1 uppercase tracking-wider">stderr</p>
              <pre className="bg-dark-950 rounded p-2 text-xs text-red-400/70 max-h-[200px] overflow-y-auto whitespace-pre-wrap font-mono">{exec.stderr_preview}</pre>
            </div>
          )}
          {exec.container_name && (
            <p className="text-[10px] text-dark-500">{t('fullIaTesting.container')}: <span className="font-mono text-dark-400">{exec.container_name}</span></p>
          )}
        </div>
      )}
    </div>
  )
}

function SeverityMiniChart({ sevCounts }: { sevCounts: Record<string, number> }) {
  const data = ['critical', 'high', 'medium', 'low', 'info']
    .filter(s => (sevCounts[s] || 0) > 0)
    .map(s => ({ name: s, value: sevCounts[s] || 0 }))

  if (data.length === 0) return null

  return (
    <div className="w-20 h-20 flex-shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={32} innerRadius={16} strokeWidth={0}>
            {data.map(entry => (
              <Cell key={entry.name} fill={SEVERITY_CHART_COLORS[entry.name]} />
            ))}
          </Pie>
          <RechartsTooltip
            contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px', padding: '4px 8px' }}
            itemStyle={{ color: '#e2e8f0' }}
            formatter={(value: number, name: string) => [`${value}`, name.charAt(0).toUpperCase() + name.slice(1)]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function LogViewer({ logs, logFilter, setLogFilter, logSearch, setLogSearch, t }: {
  logs: AgentLog[]; logFilter: string; setLogFilter: (f: string) => void
  logSearch: string; setLogSearch: (s: string) => void; t: any
}) {
  const logScrollRef = useRef<HTMLDivElement>(null)
  const [followLatest, setFollowLatest] = useState(true)

  const filteredLogs = useMemo(() =>
    logs.filter(log => {
      if (!matchLogFilter(log, logFilter)) return false
      if (logSearch && !log.message.toLowerCase().includes(logSearch.toLowerCase())) return false
      return true
    }), [logs, logFilter, logSearch]
  )

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
    <div className="bg-dark-900 rounded-xl overflow-hidden">
      <div className="flex items-center gap-1.5 p-2 border-b border-dark-700 flex-wrap">
        {getLogFilters(t).map(f => (
          <button
            key={f.key}
            onClick={() => setLogFilter(f.key)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              logFilter === f.key ? 'bg-dark-700 text-white' : `text-dark-500 hover:text-dark-300 ${f.color}`
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1 min-w-0" />
        <label className="flex items-center gap-1.5 text-[10px] text-dark-500 cursor-pointer shrink-0">
          <input
            type="checkbox"
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
            className="w-3.5 h-3.5 rounded border-dark-600 bg-dark-800 text-primary-500"
          />
          {t('autoPentest.followLatestLogs')}
        </label>
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none" />
          <input
            type="text"
            value={logSearch}
            onChange={e => setLogSearch(e.target.value)}
            placeholder={t('fullIaTesting.search')}
            className="pl-6 pr-2 py-1 bg-dark-800 border border-dark-700 rounded text-xs text-white placeholder-dark-500 focus:outline-none focus:border-dark-500 w-32 sm:w-40"
          />
        </div>
        <span className="text-[10px] text-dark-600 tabular-nums">{filteredLogs.length}/{logs.length}</span>
      </div>
      <div
        ref={logScrollRef}
        onScroll={onLogScroll}
        className="p-3 max-h-[400px] overflow-y-auto font-mono text-xs space-y-px overscroll-y-contain"
      >
        {filteredLogs.length === 0 ? (
          <p className="text-dark-500 text-center py-4">
            {logs.length === 0 ? t('fullIaTesting.waitingForLogs') : t('fullIaTesting.noLogsMatch')}
          </p>
        ) : (
          filteredLogs.map((log, i) => (
            <div key={i} className="flex gap-2 py-0.5 hover:bg-dark-800/30 rounded px-1 -mx-1">
              <span className="text-dark-600 flex-shrink-0 text-[10px] tabular-nums">{log.time?.slice(11, 19) || ''}</span>
              <span className={`flex-shrink-0 uppercase w-10 text-[10px] ${
                log.level === 'error' ? 'text-red-400' :
                log.level === 'warning' ? 'text-yellow-400' :
                log.level === 'success' ? 'text-green-400' :
                log.level === 'info' ? 'text-blue-400' : 'text-dark-500'
              }`}>{log.level}</span>
              <span className={`break-all ${logMessageColor(log.message) || (log.source === 'llm' ? 'text-purple-400' : 'text-dark-300')}`}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border shadow-2xl pointer-events-auto ${
            toast.severity === 'critical' ? 'bg-red-950/90 border-red-500/40 text-red-300' :
            toast.severity === 'high' ? 'bg-orange-950/90 border-orange-500/40 text-orange-300' :
            toast.severity === 'medium' ? 'bg-yellow-950/90 border-yellow-500/40 text-yellow-300' :
            toast.severity === 'completed' ? 'bg-green-950/90 border-green-500/40 text-green-300' :
            toast.severity === 'error' ? 'bg-red-950/90 border-red-500/40 text-red-300' :
            'bg-dark-800/95 border-dark-600 text-dark-300'
          }`}
        >
          {toast.severity === 'completed' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : toast.severity === 'error' || toast.severity === 'critical' ? (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Bug className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="text-sm flex-1 line-clamp-2">{toast.message}</span>
          <button onClick={() => onDismiss(toast.id)} className="text-dark-500 hover:text-white flex-shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FullIATestingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Form state
  const [target, setTarget] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [authType, setAuthType] = useState('')
  const [authValue, setAuthValue] = useState('')
  const [availableModels, setAvailableModels] = useState<Array<{ provider_id: string; provider_name: string; default_model: string; tier: number; available_models: string[] }>>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')

  // Prompt state
  const [promptContent, setPromptContent] = useState<string | null>(null)
  const [promptLoading, setPromptLoading] = useState(true)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [showPromptPreview, setShowPromptPreview] = useState(false)

  // Agent state
  const [agentId, setAgentId] = useState<string | null>(null)
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [error, setError] = useState<string | null>(null)

  // Live stats
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // UI state
  const [activeTab, setActiveTab] = useState<'findings' | 'logs'>('findings')
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null)
  const [expandedTool, setExpandedTool] = useState<string | null>(null)
  const [findingsFilter, setFindingsFilter] = useState<'confirmed' | 'rejected' | 'all'>('all')
  const [logFilter, setLogFilter] = useState('all')
  const [logSearch, setLogSearch] = useState('')

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([])

  // Finding animations
  const [newFindingIds, setNewFindingIds] = useState<Set<string>>(new Set())

  // Connection state
  const [connectionLost, setConnectionLost] = useState(false)

  // Report
  const [generatingReport, setGeneratingReport] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)

  // Refs
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const seenFindingIdsRef = useRef<Set<string>>(new Set())
  const prevPhaseRef = useRef<string | null>(null)
  const prevStatusRef = useRef<string | null>(null)
  const consecutiveErrorsRef = useRef(0)
  const newFindingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Toast Helper ─────────────────────────────────────────────────────────

  const addToast = useCallback((message: string, severity: string = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setToasts(prev => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, severity, timestamp: Date.now() }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_DURATION)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // ─── Mount: load prompt + models + restore session ────────────────────────

  useEffect(() => {
    fetch('/api/v1/full-ia/prompt')
      .then(r => r.json())
      .then(data => { setPromptContent(data.content); setPromptLoading(false) })
      .catch(() => { setPromptError(t('fullIaTesting.failedToLoadPrompt')); setPromptLoading(false) })

    fetch('/api/v1/providers/available-models')
      .then(r => r.json())
      .then(data => setAvailableModels(data.models || []))
      .catch(() => {})

    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) {
        const sess = JSON.parse(saved)
        setAgentId(sess.agentId)
        setTarget(sess.target || '')
        setIsRunning(sess.status === 'running')
      }
    } catch { /* ignore */ }
  }, [])

  // ─── Elapsed Time Ticker ──────────────────────────────────────────────────

  useEffect(() => {
    if (!status?.started_at) return
    const startTime = new Date(status.started_at).getTime()
    if (isRunning) {
      const tick = () => setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))
      tick()
      const id = setInterval(tick, 1000)
      return () => clearInterval(id)
    } else {
      const endTime = status.completed_at
        ? new Date(status.completed_at).getTime()
        : Date.now()
      setElapsedSeconds(Math.max(0, Math.floor((endTime - startTime) / 1000)))
    }
  }, [isRunning, status?.started_at, status?.completed_at])

  // ─── Polling ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!agentId) return

    const poll = async () => {
      try {
        const s = await agentApi.getStatus(agentId)
        consecutiveErrorsRef.current = 0
        if (connectionLost) setConnectionLost(false)

        setStatus(s)
        const running = s.status === 'running' || s.status === 'paused'
        setIsRunning(running)

        // Persist session
        try {
          const saved = localStorage.getItem(SESSION_KEY)
          if (saved) {
            const sess = JSON.parse(saved)
            sess.status = s.status
            localStorage.setItem(SESSION_KEY, JSON.stringify(sess))
          }
        } catch { /* ignore */ }

        // Phase change detection
        if (prevPhaseRef.current && s.phase && s.phase !== prevPhaseRef.current) {
          addToast(`${t('fullIaTesting.phase')}: ${s.phase}`, 'info')
        }
        prevPhaseRef.current = s.phase || null

        // Status transition detection
        if (prevStatusRef.current === 'running' && s.status === 'completed') {
          addToast(t('fullIaTesting.pentestComplete', { count: s.findings_count }), 'completed')
        } else if (prevStatusRef.current === 'running' && s.status === 'error') {
          addToast(t('fullIaTesting.pentestFailed'), 'error')
        } else if (prevStatusRef.current === 'running' && s.status === 'stopped') {
          addToast(t('fullIaTesting.pentestStopped'), 'info')
        }
        prevStatusRef.current = s.status

        // New finding detection
        const currentIds = new Set((s.findings || []).map((f: AgentFinding) => f.id))
        if (seenFindingIdsRef.current.size > 0) {
          const newIds = [...currentIds].filter(id => !seenFindingIdsRef.current.has(id))
          if (newIds.length > 0) {
            newIds.forEach(id => {
              const f = s.findings?.find((x: AgentFinding) => x.id === id)
              if (f) addToast(`${t(`severity.${f.severity}`)}: ${f.title}`, f.severity)
            })
            setNewFindingIds(new Set(newIds))
            if (newFindingTimerRef.current) clearTimeout(newFindingTimerRef.current)
            newFindingTimerRef.current = setTimeout(() => setNewFindingIds(new Set()), 3000)
          }
        }
        seenFindingIdsRef.current = currentIds
      } catch {
        consecutiveErrorsRef.current += 1
        if (consecutiveErrorsRef.current >= 3) setConnectionLost(true)
      }

      // Fetch logs
      try {
        const logData = await agentApi.getLogs(agentId, 300)
        setLogs(logData.logs || [])
      } catch { /* ignore */ }
    }

    poll()
    const interval = consecutiveErrorsRef.current >= 3 ? POLL_INTERVAL_ERROR : POLL_INTERVAL
    pollRef.current = setInterval(poll, interval)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [agentId, connectionLost, addToast])

  // ─── Actions ──────────────────────────────────────────────────────────────

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
      const resp = await agentApi.autoPentest(primaryTarget, {
        mode: 'full_llm_pentest',
        prompt: promptContent,
        enable_kali_sandbox: false,
        auth_type: authType || undefined,
        auth_value: authValue || undefined,
        preferred_provider: selectedProvider || undefined,
        preferred_model: selectedModel || undefined,
      })

      setAgentId(resp.agent_id)
      setIsRunning(true)
      addToast(t('fullIaTesting.pentestStarted'), 'info')
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        agentId: resp.agent_id,
        target: primaryTarget,
        startedAt: new Date().toISOString(),
        status: 'running',
      }))
    } catch (err: any) {
      if (err?.response?.status === 429) {
        setError(err.response.data.detail)
      } else {
        setError(err?.response?.data?.detail || err?.message || t('fullIaTesting.failedToStart'))
      }
    }
  }

  const handleStop = async () => {
    if (!agentId) return
    try {
      await agentApi.stop(agentId)
      setIsRunning(false)
    } catch { /* ignore */ }
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
      addToast(t('fullIaTesting.aiReportGenerated'), 'completed')
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('fullIaTesting.failedToGenerateReport'))
    } finally {
      setGeneratingReport(false)
    }
  }, [status?.scan_id, target, selectedProvider, selectedModel, addToast, t])

  // ─── Derived State ────────────────────────────────────────────────────────

  const currentPhaseIdx = status ? phaseFromProgress(status.progress) : -1
  const findings = status?.findings || []
  const rejectedFindings = status?.rejected_findings || []
  const allFindings = useMemo(() => [...findings, ...rejectedFindings], [findings, rejectedFindings])
  const displayFindings = findingsFilter === 'confirmed' ? findings
    : findingsFilter === 'rejected' ? rejectedFindings : allFindings
  const sevCounts = useMemo(() =>
    findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc }, {} as Record<string, number>),
    [findings]
  )
  const toolExecutions: ToolExecution[] = status?.tool_executions || []
  const containerStatus: ContainerStatus | undefined = status?.container_status

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center py-8 sm:py-12 px-3 sm:px-4">
      {/* Inline keyframes for animations */}
      <style>{`
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glowPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
      `}</style>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Connection Lost Banner */}
      {connectionLost && (
        <div className="w-full max-w-4xl mb-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center gap-2" style={{ animation: 'fadeSlideIn 0.3s ease-out' }}>
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-400 text-sm flex-1">{t('fullIaTesting.connectionIssues')}</span>
          <Loader2 className="w-4 h-4 text-yellow-400 animate-spin flex-shrink-0" />
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-8 sm:mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-2xl mb-4">
          <Crosshair className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">{t('fullIaTesting.title')}</h1>
        <p className="text-dark-400 max-w-md mx-auto text-sm">
          {t('fullIaTesting.subtitle')}
        </p>
        {promptContent && (
          <button
            onClick={() => setShowPromptPreview(!showPromptPreview)}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-300 hover:text-white hover:border-dark-500 transition-all"
          >
            <ScrollText className="w-4 h-4" />
            {showPromptPreview ? t('fullIaTesting.hidePrompt') : t('fullIaTesting.viewPrompt')}
            {promptContent && <span className="text-dark-500 text-xs">({promptContent.split('\n').length} {t('fullIaTesting.lines')})</span>}
          </button>
        )}
      </div>

      {/* Prompt Preview */}
      {showPromptPreview && promptContent && (
        <div className="w-full max-w-4xl mb-6 bg-dark-800 border border-dark-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm">{t('fullIaTesting.methodologyPrompt')}</h3>
            <button onClick={() => setShowPromptPreview(false)} className="text-dark-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <pre className="bg-dark-900 rounded-lg p-4 text-xs text-dark-300 max-h-96 overflow-y-auto whitespace-pre-wrap font-mono">
            {promptContent}
          </pre>
        </div>
      )}

      {/* Prompt Loading / Error */}
      {promptLoading && (
        <div className="w-full max-w-2xl mb-6 flex items-center justify-center gap-2 text-dark-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>{t('fullIaTesting.loadingPrompt')}</span>
        </div>
      )}
      {promptError && (
        <div className="w-full max-w-2xl mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span className="text-red-400 text-sm">{promptError}</span>
        </div>
      )}

      {/* ═══ START FORM ═══ */}
      {!agentId && (
        <div className="w-full max-w-2xl bg-dark-800 border border-dark-700 rounded-2xl p-6 sm:p-8">
          <div className="mb-6">
            <label className="block text-sm font-medium text-dark-300 mb-2">{t('fullIaTesting.targetUrl')}</label>
            <input
              type="url"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder={t('fullIaTesting.targetPlaceholder')}
              className="w-full px-4 py-4 bg-dark-900 border border-dark-600 rounded-xl text-white text-lg placeholder-dark-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
            />
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
              <Brain className="w-3 h-3" /> {t('fullIaTesting.llmDrivenPentest')}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-400">
              <Crosshair className="w-3 h-3" /> {t('fullIaTesting.aiPlansExecutes')}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg text-xs text-orange-400">
              <Shield className="w-3 h-3" /> {t('fullIaTesting.fullValidation')}
            </span>
          </div>

          {availableModels.length > 0 && (
            <div className="mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-dark-400 mb-1">{t('fullIaTesting.llmProvider')}</label>
                <select
                  value={selectedProvider}
                  onChange={e => {
                    setSelectedProvider(e.target.value)
                    const m = availableModels.find(m => m.provider_id === e.target.value)
                    setSelectedModel(m ? m.default_model : '')
                  }}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
                >
                  <option value="">{t('fullIaTesting.autoBest')}</option>
                  {availableModels.map(m => (
                    <option key={m.provider_id} value={m.provider_id}>{m.provider_name} (Tier {m.tier})</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-dark-400 mb-1">{t('fullIaTesting.model')}</label>
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
                >
                  <option value="">{t('fullIaTesting.autoDefault')}</option>
                  {(selectedProvider
                    ? (availableModels.find(m => m.provider_id === selectedProvider)?.available_models || [])
                    : availableModels.flatMap(m => m.available_models).filter((v, i, a) => a.indexOf(v) === i)
                  ).map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="mb-6">
            <button
              onClick={() => setShowAuth(!showAuth)}
              className="flex items-center gap-2 text-sm text-dark-400 hover:text-white transition-colors"
            >
              <Lock className="w-4 h-4" />
              <span>{t('fullIaTesting.authentication')}</span>
              {showAuth ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showAuth && (
              <div className="mt-3 space-y-3 pl-6">
                <select
                  value={authType}
                  onChange={e => setAuthType(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
                >
                  <option value="">{t('fullIaTesting.noAuth')}</option>
                  <option value="bearer">{t('fullIaTesting.bearerToken')}</option>
                  <option value="cookie">{t('fullIaTesting.cookie')}</option>
                  <option value="basic">{t('fullIaTesting.basicAuth')}</option>
                  <option value="header">{t('fullIaTesting.customHeader')}</option>
                </select>
                {authType && (
                  <input
                    type="text"
                    value={authValue}
                    onChange={e => setAuthValue(e.target.value)}
                    placeholder={
                      authType === 'bearer' ? 'eyJhbGciOiJIUzI1NiIs...' :
                      authType === 'cookie' ? 'session=abc123; token=xyz' :
                      authType === 'basic' ? 'admin:password123' : 'X-API-Key:your-api-key'
                    }
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-red-500 transition-colors"
                  />
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={!target.trim() || !promptContent || promptLoading}
            className="w-full py-4 bg-red-500 hover:bg-red-600 disabled:bg-dark-600 disabled:text-dark-400 text-white font-bold text-lg rounded-xl transition-colors flex items-center justify-center gap-3"
          >
            <Brain className="w-6 h-6" />
            {t('fullIaTesting.startFullLlmPentest')}
          </button>
        </div>
      )}

      {/* ═══ ACTIVE SESSION VIEW ═══ */}
      {agentId && (
        <div className="w-full max-w-4xl">

          {/* Session Header */}
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 sm:p-6 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                  isRunning ? 'bg-red-500 animate-pulse' :
                  status?.status === 'completed' ? 'bg-green-500' :
                  status?.status === 'error' ? 'bg-red-500' : 'bg-gray-500'
                }`} />
                <h3 className="text-white font-semibold truncate">
                  {isRunning ? t('fullIaTesting.pentestRunning') :
                   status?.status === 'completed' ? t('fullIaTesting.pentestCompleteTitle') :
                   status?.status === 'error' ? t('fullIaTesting.pentestFailedTitle') : t('fullIaTesting.pentestStoppedTitle')}
                </h3>
                <span className="text-dark-400 text-sm truncate max-w-[200px] sm:max-w-[300px] hidden sm:inline">{target}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isRunning && (
                  <button onClick={handleStop} className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors flex items-center gap-1.5">
                    <X className="w-4 h-4" /> {t('common.stop')}
                  </button>
                )}
                {!isRunning && (
                  <>
                    <button onClick={handleClear} className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors flex items-center gap-1.5">
                      <Crosshair className="w-4 h-4" /> {t('fullIaTesting.newTest')}
                    </button>
                    <button onClick={handleClear} className="px-4 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-300 rounded-lg text-sm transition-colors flex items-center gap-1.5">
                      <Trash2 className="w-4 h-4" /> {t('common.clear')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Live Stats Dashboard */}
          {status && (
            <LiveStatsDashboard
              status={status}
              elapsedSeconds={elapsedSeconds}
              toolExecutions={toolExecutions}
              t={t}
            />
          )}

          {/* Progress Panel */}
          {status && (
            <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 sm:p-6 mb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-dark-400">{status.phase || t('fullIaTesting.initializing')}</span>
                <span className="text-dark-400 tabular-nums font-mono">{status.progress}%</span>
              </div>

              {/* Enhanced Progress Bar */}
              <div className="relative w-full bg-dark-900 rounded-full h-3 mb-4 overflow-hidden">
                <div className="absolute top-0 left-1/2 w-px h-full bg-dark-700 z-10" />
                <div className="absolute top-0 left-3/4 w-px h-full bg-dark-700 z-10" />
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out relative"
                  style={{ width: `${status.progress}%`, background: 'linear-gradient(90deg, #e94560, #dc2626)' }}
                >
                  {isRunning && (
                    <div
                      className="absolute right-0 top-0 h-full w-6 rounded-full"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25))', animation: 'glowPulse 1.5s ease-in-out infinite' }}
                    />
                  )}
                </div>
              </div>

              {/* Phase Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {getPhases(t).map((phase, idx) => {
                  const Icon = phase.icon
                  const isActive = idx === currentPhaseIdx && isRunning
                  const isDone = idx < currentPhaseIdx || status.status === 'completed' || status.status === 'stopped'
                  return (
                    <div
                      key={phase.key}
                      className={`rounded-xl p-3 border transition-all duration-300 ${
                        isActive ? 'bg-red-500/10 border-red-500/30' :
                        isDone   ? 'bg-dark-700/50 border-dark-600' :
                                   'bg-dark-900 border-dark-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {isActive ? <Loader2 className="w-4 h-4 animate-spin text-red-400 flex-shrink-0" /> :
                         isDone   ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> :
                                    <Icon className="w-4 h-4 text-dark-500 flex-shrink-0" />}
                        <span className={`text-xs font-medium ${isActive ? 'text-red-400' : isDone ? 'text-dark-300' : 'text-dark-500'}`}>
                          {phase.label}
                        </span>
                        <span className={`ml-auto text-[10px] tabular-nums ${isActive ? 'text-red-500/60' : isDone ? 'text-dark-500' : 'text-dark-600'}`}>
                          {phase.range[0]}-{phase.range[1]}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Container Telemetry */}
          {containerStatus && (
            <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 sm:p-6 mb-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Terminal className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-white font-semibold text-sm">{t('fullIaTesting.containerTelemetry')}</h3>
                  <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    containerStatus.online
                      ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                      : 'bg-red-500/20 text-red-400 border border-red-500/40'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${containerStatus.online ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                    {containerStatus.online ? t('fullIaTesting.online') : t('fullIaTesting.offline')}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-dark-400 font-mono">
                  {containerStatus.container_id && <span>ID: {containerStatus.container_id.slice(0, 12)}</span>}
                  {containerStatus.container_name && <span className="hidden sm:inline">{containerStatus.container_name}</span>}
                </div>
              </div>

              {toolExecutions.length > 0 ? (
                <div className="space-y-0 max-h-[350px] overflow-y-auto rounded-lg border border-dark-700 bg-dark-900/50">
                  <div className="grid grid-cols-[50px_70px_1fr_50px_65px_55px_20px] sm:grid-cols-[60px_80px_1fr_50px_70px_60px_24px] gap-2 text-[10px] text-dark-500 font-semibold uppercase tracking-wider px-2 py-2 border-b border-dark-700 bg-dark-900 sticky top-0">
                    <span>{t('fullIaTesting.task')}</span>
                    <span>{t('fullIaTesting.tool')}</span>
                    <span>{t('fullIaTesting.command')}</span>
                    <span className="text-center">{t('fullIaTesting.exit')}</span>
                    <span className="text-right">{t('fullIaTesting.duration')}</span>
                    <span className="text-center">{t('fullIaTesting.finds')}</span>
                    <span />
                  </div>
                  {toolExecutions.map((exec, i) => (
                    <ToolExecutionRow
                      key={exec.task_id || i}
                      exec={exec}
                      expanded={expandedTool === (exec.task_id || String(i))}
                      onToggle={() => setExpandedTool(expandedTool === (exec.task_id || String(i)) ? null : (exec.task_id || String(i)))}
                      t={t}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center text-dark-500 text-sm py-6">
                  {isRunning ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('fullIaTesting.waitingForToolExec')}
                    </span>
                  ) : t('fullIaTesting.noToolExecutions')}
                </div>
              )}

              {/* Last command summary */}
              {toolExecutions.length > 0 && (() => {
                const last = toolExecutions[toolExecutions.length - 1]
                return (
                  <div className="mt-3 pt-3 border-t border-dark-700 flex items-center gap-2 text-xs flex-wrap">
                    <span className="text-dark-500">{t('fullIaTesting.last')}:</span>
                    <span className="text-cyan-400 font-medium">{last.tool}</span>
                    <span className={`font-bold ${last.exit_code === 0 ? 'text-green-400' : 'text-red-400'}`}>
                      exit:{last.exit_code}
                    </span>
                    <span className="text-dark-400">{last.duration !== null ? `${last.duration.toFixed(1)}s` : ''}</span>
                    {last.findings_count > 0 && <span className="text-red-400">{last.findings_count} {t('fullIaTesting.findings')}</span>}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ═══ Findings & Logs Tabs ═══ */}
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 sm:p-6 mb-4">
            {/* Tab bar */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-white font-semibold text-sm">
                  {activeTab === 'findings' ? `${t('fullIaTesting.findings')} (${findings.length})` : t('fullIaTesting.activityLog')}
                </h3>
                {activeTab === 'findings' && (
                  <div className="flex gap-1.5 items-center">
                    {['critical', 'high', 'medium', 'low', 'info'].map(sev => {
                      const count = sevCounts[sev] || 0
                      if (count === 0) return null
                      return (
                        <span key={sev} className={`${SEVERITY_COLORS[sev]} text-white px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums`}>
                          {count}
                        </span>
                      )
                    })}
                    <SeverityMiniChart sevCounts={sevCounts} />
                  </div>
                )}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setActiveTab('findings')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    activeTab === 'findings' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-dark-700 text-dark-400 hover:text-white border border-transparent'
                  }`}
                >
                  <Bug className="w-3 h-3" />{t('fullIaTesting.findings')}
                  {findings.length > 0 && <span className="text-[10px] opacity-70">({findings.length})</span>}
                </button>
                {rejectedFindings.length > 0 && (
                  <button
                    onClick={() => { setActiveTab('findings'); setFindingsFilter(findingsFilter === 'rejected' ? 'all' : 'rejected') }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      findingsFilter === 'rejected' && activeTab === 'findings'
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                        : 'bg-dark-700 text-orange-400/60 hover:text-orange-400 border border-transparent'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />{t('fullIaTesting.rejected')} ({rejectedFindings.length})
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    activeTab === 'logs' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-dark-700 text-dark-400 hover:text-white border border-transparent'
                  }`}
                >
                  <ScrollText className="w-3 h-3" />{t('fullIaTesting.log')}
                  {logs.length > 0 && <span className="text-[10px] opacity-70">({logs.length})</span>}
                </button>
              </div>
            </div>

            {/* Filter sub-tabs for findings */}
            {activeTab === 'findings' && allFindings.length > 0 && rejectedFindings.length > 0 && (
              <div className="flex gap-1 mb-3">
                {(['all', 'confirmed', 'rejected'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFindingsFilter(f)}
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                      findingsFilter === f ? 'bg-primary-500/20 text-primary-400' : 'text-dark-500 hover:text-dark-300'
                    }`}
                  >
                    {f === 'all' ? `${t('fullIaTesting.all')} (${allFindings.length})` :
                     f === 'confirmed' ? `${t('fullIaTesting.confirmed')} (${findings.length})` :
                     `${t('fullIaTesting.rejected')} (${rejectedFindings.length})`}
                  </button>
                ))}
              </div>
            )}

            {/* Findings List */}
            {activeTab === 'findings' && (
              displayFindings.length > 0 ? (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {displayFindings.map((f: AgentFinding) => {
                    const isNew = newFindingIds.has(f.id)
                    return (
                      <div
                        key={f.id}
                        className={`border ${f.ai_status === 'rejected' ? 'border-orange-500/30 opacity-70' : (SEVERITY_BORDER[f.severity] || 'border-dark-600')} rounded-xl bg-dark-900 overflow-hidden transition-all duration-300 ${
                          isNew ? 'ring-2 ring-red-500/30' : ''
                        }`}
                        style={isNew ? { animation: 'fadeSlideIn 0.5s ease-out' } : undefined}
                      >
                        <button
                          onClick={() => setExpandedFinding(expandedFinding === f.id ? null : f.id)}
                          className="w-full flex items-center gap-2 sm:gap-3 p-3 text-left hover:bg-dark-800/50 transition-colors"
                        >
                          <span className={`${SEVERITY_COLORS[f.severity]} text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0`}>
                            {t(`severity.${f.severity}`)}
                          </span>
                          <span className={`text-sm flex-1 truncate ${f.ai_status === 'rejected' ? 'text-dark-400' : 'text-white'}`}>{f.title}</span>
                          {f.ai_status === 'rejected' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 flex-shrink-0">{t('fullIaTesting.rejected')}</span>
                          )}
                          {(() => {
                            const conf = getConfidenceDisplay(f, t)
                            if (!conf) return null
                            return (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 tabular-nums ${CONFIDENCE_STYLES[conf.color]}`}>
                                {conf.score}
                              </span>
                            )
                          })()}
                          <span className="text-dark-500 text-[10px] flex-shrink-0 hidden sm:inline">{f.vulnerability_type}</span>
                          {expandedFinding === f.id ? <ChevronUp className="w-4 h-4 text-dark-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-dark-400 flex-shrink-0" />}
                        </button>

                        {expandedFinding === f.id && (
                          <div className="px-3 pb-3 space-y-2 border-t border-dark-700 pt-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              {f.affected_endpoint && (
                                <div><span className="text-dark-500">{t('fullIaTesting.endpoint')}: </span><span className="text-dark-300 break-all">{f.affected_endpoint}</span></div>
                              )}
                              {f.parameter && (
                                <div><span className="text-dark-500">{t('fullIaTesting.parameter')}: </span><span className="text-dark-300">{f.parameter}</span></div>
                              )}
                              {f.cwe_id && (
                                <div><span className="text-dark-500">{t('fullIaTesting.cwe')}: </span><span className="text-dark-300">{f.cwe_id}</span></div>
                              )}
                              {f.cvss_score > 0 && (
                                <div><span className="text-dark-500">{t('fullIaTesting.cvss')}: </span><span className="text-dark-300">{f.cvss_score}</span></div>
                              )}
                            </div>
                            {f.description && (
                              <p className="text-dark-400 text-xs">{f.description.substring(0, 400)}{f.description.length > 400 ? '...' : ''}</p>
                            )}
                            {f.payload && (
                              <div className="bg-dark-800 rounded-lg p-2">
                                <span className="text-dark-500 text-xs">{t('fullIaTesting.payload')}: </span>
                                <code className="text-green-400 text-xs break-all">{f.payload.substring(0, 300)}</code>
                              </div>
                            )}
                            {f.evidence && (
                              <div className="bg-dark-800 rounded-lg p-2">
                                <span className="text-dark-500 text-xs">{t('fullIaTesting.evidence')}: </span>
                                <span className="text-dark-300 text-xs">{f.evidence.substring(0, 400)}</span>
                              </div>
                            )}
                            {f.poc_code && (
                              <div>
                                <p className="text-xs font-medium text-dark-400 mb-1">{t('fullIaTesting.pocCode')}</p>
                                <pre className="p-2 bg-dark-950 rounded text-xs text-green-400 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap font-mono">{f.poc_code}</pre>
                              </div>
                            )}
                            {f.ai_status === 'rejected' && f.rejection_reason && (
                              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-2">
                                <span className="text-orange-400 text-xs font-medium">{t('fullIaTesting.rejection')}: </span>
                                <span className="text-orange-300/80 text-xs">{f.rejection_reason}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs ${f.ai_status === 'rejected' ? 'text-orange-400' : f.ai_verified ? 'text-green-400' : 'text-dark-500'}`}>
                                {f.ai_status === 'rejected' ? t('fullIaTesting.aiRejected') : f.ai_verified ? t('fullIaTesting.aiVerified') : t('fullIaTesting.toolDetected')}
                              </span>
                              {(() => {
                                const conf = getConfidenceDisplay(f, t)
                                if (!conf) return null
                                return (
                                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border tabular-nums ${CONFIDENCE_STYLES[conf.color]}`}>
                                    {t('fullIaTesting.confidence')}: {conf.score}/100 ({conf.label})
                                  </span>
                                )
                              })()}
                            </div>
                            {(() => {
                              const hasBreakdown = f.confidence_breakdown && Object.keys(f.confidence_breakdown).length > 0
                              const hasProof = !!f.proof_of_execution
                              const hasControls = !!f.negative_controls
                              if (!hasBreakdown && !hasProof && !hasControls) return null
                              return (
                                <div className="bg-dark-800 rounded-lg p-2 space-y-1">
                                  {hasBreakdown && (
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-dark-400">
                                      {Object.entries(f.confidence_breakdown!).map(([key, val]) => (
                                        <div key={key} className="flex justify-between">
                                          <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                                          <span className={`font-mono font-medium tabular-nums ${
                                            Number(val) > 0 ? 'text-green-400' : Number(val) < 0 ? 'text-red-400' : 'text-dark-500'
                                          }`}>{Number(val) > 0 ? '+' : ''}{val}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {hasProof && (
                                    <p className="text-xs text-dark-400 flex items-start gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
                                      <span>{t('fullIaTesting.proof')}: <span className="text-dark-300">{f.proof_of_execution}</span></span>
                                    </p>
                                  )}
                                  {hasControls && (
                                    <p className="text-xs text-dark-400 flex items-start gap-1">
                                      <Shield className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
                                      <span>{t('fullIaTesting.controls')}: <span className="text-dark-300">{f.negative_controls}</span></span>
                                    </p>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-dark-500">
                  {isRunning ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {t('fullIaTesting.pentestInProgress')}
                    </span>
                  ) : (
                    t('fullIaTesting.noFindings')
                  )}
                </div>
              )
            )}

            {/* Activity Log */}
            {activeTab === 'logs' && (
              <LogViewer
                logs={logs}
                logFilter={logFilter}
                setLogFilter={setLogFilter}
                logSearch={logSearch}
                setLogSearch={setLogSearch}
                t={t}
              />
            )}
          </div>

          {/* Completion / Stopped Actions */}
          {(status?.status === 'completed' || status?.status === 'stopped') && (
            <div className={`bg-dark-800 border ${status.status === 'completed' ? 'border-green-500/30' : 'border-yellow-500/30'} rounded-2xl p-4 sm:p-6 mb-4`} style={{ animation: 'fadeSlideIn 0.5s ease-out' }}>
              <div className="flex items-center gap-3 mb-4">
                {status.status === 'completed' ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-yellow-500" />
                )}
                <h3 className={`${status.status === 'completed' ? 'text-green-400' : 'text-yellow-400'} font-semibold text-lg`}>
                  {status.status === 'completed' ? t('fullIaTesting.pentestCompleteTitle') : t('fullIaTesting.pentestStoppedTitle')}
                </h3>
              </div>

              <div className="flex items-center gap-4 mb-4 flex-wrap">
                <p className="text-dark-400 text-sm">
                  {status.status === 'completed'
                    ? t('fullIaTesting.foundVulnerabilities', { count: findings.length, target })
                    : t('fullIaTesting.stoppedAt', { progress: status.progress, count: findings.length })}
                </p>
                {elapsedSeconds > 0 && (
                  <span className="text-dark-500 text-xs font-mono">{t('fullIaTesting.duration')}: {formatElapsed(elapsedSeconds)}</span>
                )}
              </div>

              {generatingReport && (
                <div className="mb-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-purple-400 animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-purple-400 font-medium text-sm">{t('fullIaTesting.generatingAiReport')}</p>
                    <p className="text-dark-400 text-xs">{t('fullIaTesting.analyzingFindings')}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => navigate(`/agent/${agentId}`)}
                  className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
                >
                  <ExternalLink className="w-4 h-4" /> {t('fullIaTesting.viewFullResults')}
                </button>

                {!reportId ? (
                  <button
                    onClick={handleGenerateAiReport}
                    disabled={generatingReport || !status.scan_id}
                    className="px-5 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
                    title={selectedProvider ? `Using: ${selectedProvider}/${selectedModel || 'auto'}` : 'Using: auto'}
                  >
                    <Sparkles className="w-4 h-4" /> {t('fullIaTesting.generateAiReport')}
                    {selectedProvider && <span className="text-xs opacity-70">({selectedProvider})</span>}
                  </button>
                ) : (
                  <>
                    <a
                      href={reportsApi.getViewUrl(reportId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
                    >
                      <FileText className="w-4 h-4" /> {t('fullIaTesting.viewReport')}
                    </a>
                    <a
                      href={reportsApi.getDownloadZipUrl(reportId)}
                      className="px-5 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
                    >
                      <Download className="w-4 h-4" /> {t('fullIaTesting.downloadZip')}
                    </a>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error State */}
          {status?.status === 'error' && (
            <div className="bg-dark-800 border border-red-500/30 rounded-2xl p-4 sm:p-6" style={{ animation: 'fadeSlideIn 0.5s ease-out' }}>
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                <h3 className="text-red-400 font-semibold">{t('fullIaTesting.pentestFailedTitle')}</h3>
              </div>
              <p className="text-dark-400">{status.error || t('fullIaTesting.unexpectedError')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
