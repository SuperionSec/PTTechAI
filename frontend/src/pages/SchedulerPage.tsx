import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { relativeTime } from '../utils/time'
import { Plus, Trash2, Play, Pause, Clock, RefreshCw, Target, Calendar, ChevronDown, Shield, Zap, Search, Settings2, X } from 'lucide-react'
import Card from '../components/common/Card'
import Button from '../components/common/Button'
import Input from '../components/common/Input'
import { schedulerApi } from '../services/api'
import type { ScheduleJob, AgentRole } from '../types'

/* ---------- inline keyframes ---------- */
const styleTag = `
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes refreshSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`

/* ---------- Toast notification system ---------- */
interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

let _toastId = 0

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  const borderColor: Record<Toast['type'], string> = {
    info: 'border-blue-500',
    success: 'border-green-500',
    error: 'border-red-500',
  }
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`bg-dark-800 border-l-4 ${borderColor[t.type]} rounded-lg px-4 py-3 shadow-xl flex items-start gap-3`}
          style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
        >
          <span className="text-sm text-dark-200 flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="text-dark-500 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ---------- Delete Confirmation Modal ---------- */
function DeleteModal({ jobId, onConfirm, onCancel, t }: {
  jobId: string
  onConfirm: () => void
  onCancel: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-dark-800 rounded-xl border border-dark-700 p-6 max-w-sm w-full"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'fadeSlideIn 0.2s ease-out' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-red-500/10">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">{t('scheduler.deleteSchedule')}</h3>
        </div>
        <p className="text-sm text-dark-300 mb-6">
          {t('scheduler.deleteConfirm', { jobId })} <span className="text-white font-medium">&quot;{jobId}&quot;</span>
          {t('scheduler.deleteCannotUndo')}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={onConfirm}>
            <Trash2 className="w-4 h-4 mr-2" />
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </div>
  )
}

const getCronPresets = (t: any) => [
  { label: t('scheduler.everyHour'), value: '0 * * * *', desc: t('scheduler.everyHourDesc') },
  { label: t('scheduler.every6Hours'), value: '0 */6 * * *', desc: t('scheduler.every6HoursDesc') },
  { label: t('scheduler.daily2AM'), value: '0 2 * * *', desc: t('scheduler.daily2AMDesc') },
  { label: t('scheduler.dailyMidnight'), value: '0 0 * * *', desc: t('scheduler.dailyMidnightDesc') },
  { label: t('scheduler.weekdays9AM'), value: '0 9 * * 1-5', desc: t('scheduler.weekdays9AMDesc') },
  { label: t('scheduler.weeklyMonday'), value: '0 0 * * 1', desc: t('scheduler.weeklyMondayDesc') },
  { label: t('scheduler.weeklyFriday'), value: '0 18 * * 5', desc: t('scheduler.weeklyFridayDesc') },
  { label: t('scheduler.monthly1st'), value: '0 0 1 * *', desc: t('scheduler.monthly1stDesc') },
  { label: t('scheduler.customCron'), value: 'custom', desc: t('scheduler.customCronDesc') },
]

const getScanTypes = (t: any) => [
  { id: 'quick', label: t('scheduler.quickScan'), icon: Zap, desc: t('scheduler.quickScanDesc') },
  { id: 'full', label: t('scheduler.fullScan'), icon: Search, desc: t('scheduler.fullScanDesc') },
  { id: 'custom', label: t('scheduler.customScan'), icon: Settings2, desc: t('scheduler.customScanDesc') },
]

const getDaysOfWeek = (t: any) => [
  { id: 0, short: t('scheduler.sundayShort'), full: t('scheduler.sunday') },
  { id: 1, short: t('scheduler.mondayShort'), full: t('scheduler.monday') },
  { id: 2, short: t('scheduler.tuesdayShort'), full: t('scheduler.tuesday') },
  { id: 3, short: t('scheduler.wednesdayShort'), full: t('scheduler.wednesday') },
  { id: 4, short: t('scheduler.thursdayShort'), full: t('scheduler.thursday') },
  { id: 5, short: t('scheduler.fridayShort'), full: t('scheduler.friday') },
  { id: 6, short: t('scheduler.saturdayShort'), full: t('scheduler.saturday') },
]

const getIntervalOptions = (t: any) => [
  { label: t('scheduler.15min'), value: '15' },
  { label: t('scheduler.30min'), value: '30' },
  { label: t('scheduler.1hour'), value: '60' },
  { label: t('scheduler.2hours'), value: '120' },
  { label: t('scheduler.4hours'), value: '240' },
  { label: t('scheduler.6hours'), value: '360' },
  { label: t('scheduler.12hours'), value: '720' },
  { label: t('scheduler.24hours'), value: '1440' },
]

const getScheduleModeTabs = (t: any) => [
  { id: 'preset' as const, label: t('scheduler.presets') },
  { id: 'days' as const, label: t('scheduler.daysAndTime') },
  { id: 'interval' as const, label: t('scheduler.interval') },
]

/* ===================================================================
   Main Component
   =================================================================== */

export default function SchedulerPage() {
  const { t } = useTranslation()
  const CRON_PRESETS = useMemo(() => getCronPresets(t), [t])
  const SCAN_TYPES = useMemo(() => getScanTypes(t), [t])
  const SCHEDULE_MODE_TABS = useMemo(() => getScheduleModeTabs(t), [t])
  const DAYS_OF_WEEK = useMemo(() => getDaysOfWeek(t), [t])
  const INTERVAL_OPTIONS = useMemo(() => getIntervalOptions(t), [t])
  const [jobs, setJobs] = useState<ScheduleJob[]>([])
  const [agentRoles, setAgentRoles] = useState<AgentRole[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Form state
  const [jobId, setJobId] = useState('')
  const [target, setTarget] = useState('')
  const [scanType, setScanType] = useState('quick')
  const [scheduleMode, setScheduleMode] = useState<'interval' | 'preset' | 'days'>('preset')
  const [cronPreset, setCronPreset] = useState('0 2 * * *')
  const [customCron, setCustomCron] = useState('')
  const [intervalMinutes, setIntervalMinutes] = useState('60')
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [executionHour, setExecutionHour] = useState('02')
  const [executionMinute, setExecutionMinute] = useState('00')
  const [agentRole, setAgentRole] = useState('')
  const [showRoleDropdown, setShowRoleDropdown] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  /* ---------- Toast helpers ---------- */
  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = ++_toastId
    setToasts(prev => [...prev.slice(-4), { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  /* ---------- Derived data ---------- */
  const selectedRole = useMemo(
    () => agentRoles.find(r => r.id === agentRole),
    [agentRoles, agentRole]
  )

  const activeJobCount = useMemo(
    () => jobs.filter(j => j.status === 'active').length,
    [jobs]
  )

  const totalRunCount = useMemo(
    () => jobs.reduce((sum, j) => sum + j.run_count, 0),
    [jobs]
  )

  const intervalDisplayText = useMemo(() => {
    const mins = parseInt(intervalMinutes)
    if (isNaN(mins) || mins <= 0) return `${intervalMinutes} minutes`
    if (mins >= 60) {
      const hours = Math.floor(mins / 60)
      const remaining = mins % 60
      return remaining > 0 ? `${hours}h ${remaining}m` : `${hours} hour(s)`
    }
    return `${mins} minutes`
  }, [intervalMinutes])

  const scheduleSummaryText = useMemo(() => {
    if (scheduleMode === 'interval') {
      return `Runs every ${intervalDisplayText}`
    }
    if (scheduleMode === 'days' && selectedDays.length > 0) {
      const dayNames = [...selectedDays].sort((a, b) => a - b).map(d => DAYS_OF_WEEK[d].short).join(', ')
      return `Runs on ${dayNames} at ${executionHour}:${executionMinute}`
    }
    if (scheduleMode === 'preset' && cronPreset !== 'custom') {
      return CRON_PRESETS.find(p => p.value === cronPreset)?.desc || ''
    }
    return ''
  }, [scheduleMode, intervalDisplayText, selectedDays, executionHour, executionMinute, cronPreset])

  /* ---------- Data fetching ---------- */
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [jobsData, rolesData] = await Promise.all([
        schedulerApi.list(),
        schedulerApi.getAgentRoles(),
      ])
      setJobs(jobsData)
      setAgentRoles(rolesData)
    } catch (error) {
      console.error('Failed to fetch scheduler data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [jobsData, rolesData] = await Promise.all([
        schedulerApi.list(),
        schedulerApi.getAgentRoles(),
      ])
      setJobs(jobsData)
      setAgentRoles(rolesData)
      addToast(t('scheduler.schedulesRefreshed'), 'info')
    } catch (error) {
      console.error('Failed to fetch scheduler data:', error)
      addToast(t('scheduler.failedToRefresh'), 'error')
    } finally {
      setRefreshing(false)
    }
  }, [addToast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ---------- Form logic ---------- */
  const buildCronExpression = useCallback((): string | undefined => {
    if (scheduleMode === 'interval') return undefined
    if (scheduleMode === 'preset') {
      return cronPreset === 'custom' ? customCron : cronPreset
    }
    // days mode: build cron from selected days + time
    if (selectedDays.length === 0) return undefined
    const daysStr = [...selectedDays].sort((a, b) => a - b).join(',')
    return `${executionMinute} ${executionHour} * * ${daysStr}`
  }, [scheduleMode, cronPreset, customCron, selectedDays, executionMinute, executionHour])

  const getIntervalMinutes = useCallback((): number | undefined => {
    if (scheduleMode !== 'interval') return undefined
    return parseInt(intervalMinutes) || 60
  }, [scheduleMode, intervalMinutes])

  const resetForm = useCallback(() => {
    setJobId('')
    setTarget('')
    setScanType('quick')
    setScheduleMode('preset')
    setCronPreset('0 2 * * *')
    setCustomCron('')
    setIntervalMinutes('60')
    setSelectedDays([1, 2, 3, 4, 5])
    setExecutionHour('02')
    setExecutionMinute('00')
    setAgentRole('')
    setShowRoleDropdown(false)
  }, [])

  const handleCreate = useCallback(async () => {
    if (!jobId.trim()) {
      addToast(t('scheduler.jobIdRequired'), 'error')
      return
    }
    if (!target.trim()) {
      addToast(t('scheduler.targetUrlRequired'), 'error')
      return
    }

    const cron = buildCronExpression()
    const interval = getIntervalMinutes()

    if (!cron && !interval) {
      addToast(t('scheduler.configureSchedule'), 'error')
      return
    }

    setIsCreating(true)

    try {
      await schedulerApi.create({
        job_id: jobId.trim(),
        target: target.trim(),
        scan_type: scanType,
        cron_expression: cron,
        interval_minutes: interval,
        agent_role: agentRole || undefined,
      })
      addToast(`Schedule "${jobId}" created successfully`, 'success')
      setShowForm(false)
      resetForm()
      fetchData()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      const detail = err?.response?.data?.detail || t('scheduler.failedToCreate')
      addToast(detail, 'error')
    } finally {
      setIsCreating(false)
    }
  }, [jobId, target, scanType, agentRole, buildCronExpression, getIntervalMinutes, addToast, resetForm, fetchData])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await schedulerApi.delete(deleteTarget)
      addToast(`Schedule "${deleteTarget}" deleted`, 'success')
      setDeleteTarget(null)
      fetchData()
    } catch (error) {
      addToast(`Failed to delete "${deleteTarget}"`, 'error')
      setDeleteTarget(null)
    }
  }, [deleteTarget, addToast, fetchData])

  const handlePause = useCallback(async (id: string) => {
    try {
      await schedulerApi.pause(id)
      addToast(`Schedule "${id}" paused`, 'info')
      fetchData()
    } catch (error) {
      addToast(`Failed to pause "${id}"`, 'error')
    }
  }, [addToast, fetchData])

  const handleResume = useCallback(async (id: string) => {
    try {
      await schedulerApi.resume(id)
      addToast(`Schedule "${id}" resumed`, 'success')
      fetchData()
    } catch (error) {
      addToast(`Failed to resume "${id}"`, 'error')
    }
  }, [addToast, fetchData])

  const toggleDay = useCallback((dayId: number) => {
    setSelectedDays(prev =>
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    )
  }, [])

  const handleToggleForm = useCallback(() => {
    if (showForm) {
      resetForm()
    }
    setShowForm(prev => !prev)
  }, [showForm, resetForm])

  const handleCancelForm = useCallback(() => {
    setShowForm(false)
    resetForm()
  }, [resetForm])

  /* ---------- Render ---------- */
  return (
    <>
      <style>{styleTag}</style>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {deleteTarget && (
        <DeleteModal
          jobId={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          t={t}
        />
      )}

      <div className="max-w-5xl mx-auto space-y-6" style={{ animation: 'fadeSlideIn 0.3s ease-out' }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <div className="p-2 bg-brand-500/20 rounded-lg">
                <Calendar className="w-6 h-6 text-brand-400" />
              </div>
              {t('scheduler.title')}
            </h2>
            <p className="text-dark-400 mt-1 ml-14">{t('scheduler.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw
                className="w-4 h-4 mr-2"
                style={refreshing ? { animation: 'refreshSpin 0.8s linear infinite' } : undefined}
              />
              {t('common.refresh')}
            </Button>
            <Button onClick={handleToggleForm}>
              <Plus className="w-4 h-4 mr-2" />
              {t('scheduler.newSchedule')}
            </Button>
          </div>
        </div>

        {/* Create Form */}
        {showForm && (
          <div
            className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden"
            style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
          >
            <div className="p-5 border-b border-dark-700">
              <h3 className="text-lg font-semibold text-white">{t('scheduler.createNewSchedule')}</h3>
              <p className="text-dark-400 text-sm mt-1">{t('scheduler.createNewScheduleDesc')}</p>
            </div>

            <div className="p-5 space-y-6">
              {/* Row 1: Job ID + Target */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={t('scheduler.jobId')}
                  placeholder="weekly-internal-scan"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  helperText={t('scheduler.jobIdHelper')}
                />
                <Input
                  label={t('scheduler.targetUrl')}
                  placeholder="https://example.com"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  helperText="URL to scan on each execution"
                />
              </div>

              {/* Row 2: Scan Type */}
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-3">{t('scheduler.scanType')}</label>
                <div className="grid grid-cols-3 gap-3">
                  {SCAN_TYPES.map(({ id, label, icon: Icon, desc }) => (
                    <button
                      key={id}
                      onClick={() => setScanType(id)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        scanType === id
                          ? 'border-brand-500 bg-brand-500/10'
                          : 'border-dark-600 bg-dark-900/50 hover:border-dark-500'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${scanType === id ? 'text-brand-400' : 'text-dark-400'}`} />
                        <span className={`font-medium ${scanType === id ? 'text-white' : 'text-dark-300'}`}>{label}</span>
                      </div>
                      <p className="text-xs text-dark-500">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 3: Agent Role Dropdown */}
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-3">
                  <Shield className="w-4 h-4 inline mr-1 -mt-0.5" />
                  Agent Role
                </label>
                <div className="relative">
                  <button
                    onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-dark-600 bg-dark-900/50 hover:border-dark-500 transition-colors text-left"
                  >
                    <div>
                      {selectedRole ? (
                        <>
                          <span className="text-white font-medium">{selectedRole.name}</span>
                          <span className="text-dark-500 text-sm ml-2">- {selectedRole.description}</span>
                        </>
                      ) : (
                        <span className="text-dark-500">{t('scheduler.selectAgentRole')}</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showRoleDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showRoleDropdown && (
                    <div
                      className="absolute z-20 w-full mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-72 overflow-y-auto"
                      style={{ animation: 'fadeSlideIn 0.2s ease-out' }}
                    >
                      {/* None option */}
                      <button
                        onClick={() => { setAgentRole(''); setShowRoleDropdown(false) }}
                        className={`w-full flex items-start gap-3 p-3 text-left hover:bg-dark-700/50 transition-colors border-b border-dark-700/50 ${
                          !agentRole ? 'bg-dark-700/30' : ''
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Target className="w-4 h-4 text-dark-400" />
                        </div>
                        <div>
                          <p className="text-dark-300 font-medium">{t('scheduler.defaultAgent')}</p>
                          <p className="text-dark-500 text-xs">{t('scheduler.defaultAgentDesc')}</p>
                        </div>
                      </button>

                      {agentRoles.map((role) => (
                        <button
                          key={role.id}
                          onClick={() => { setAgentRole(role.id); setShowRoleDropdown(false) }}
                          className={`w-full flex items-start gap-3 p-3 text-left hover:bg-dark-700/50 transition-colors ${
                            agentRole === role.id ? 'bg-brand-500/10 border-l-2 border-brand-500' : ''
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            agentRole === role.id ? 'bg-brand-500/20' : 'bg-dark-600'
                          }`}>
                            <Shield className={`w-4 h-4 ${agentRole === role.id ? 'text-brand-400' : 'text-dark-400'}`} />
                          </div>
                          <div className="min-w-0">
                            <p className={`font-medium ${agentRole === role.id ? 'text-brand-400' : 'text-white'}`}>
                              {role.name}
                            </p>
                            <p className="text-dark-500 text-xs mt-0.5">{role.description}</p>
                            {role.tools.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {role.tools.slice(0, 4).map(tool => (
                                  <span key={tool} className="px-1.5 py-0.5 text-[10px] bg-dark-600 text-dark-300 rounded">
                                    {tool}
                                  </span>
                                ))}
                                {role.tools.length > 4 && (
                                  <span className="px-1.5 py-0.5 text-[10px] bg-dark-600 text-dark-400 rounded">
                                    +{role.tools.length - 4}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 4: Schedule Configuration */}
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-3">
                  <Clock className="w-4 h-4 inline mr-1 -mt-0.5" />
                  Schedule
                </label>

                {/* Schedule mode tabs */}
                <div className="flex gap-1 p-1 bg-dark-900/50 rounded-lg mb-4">
                  {SCHEDULE_MODE_TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setScheduleMode(tab.id)}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                        scheduleMode === tab.id
                          ? 'bg-brand-500 text-white shadow-sm'
                          : 'text-dark-400 hover:text-dark-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Preset mode */}
                {scheduleMode === 'preset' && (
                  <div className="space-y-3" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {CRON_PRESETS.map(preset => (
                        <button
                          key={preset.value}
                          onClick={() => setCronPreset(preset.value)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            cronPreset === preset.value
                              ? 'border-brand-500 bg-brand-500/10'
                              : 'border-dark-600 bg-dark-900/30 hover:border-dark-500'
                          }`}
                        >
                          <p className={`text-sm font-medium ${cronPreset === preset.value ? 'text-brand-400' : 'text-dark-200'}`}>
                            {preset.label}
                          </p>
                          <p className="text-xs text-dark-500 mt-0.5">{preset.desc}</p>
                        </button>
                      ))}
                    </div>
                    {cronPreset === 'custom' && (
                      <Input
                        label={t('scheduler.customCronExpression')}
                        placeholder="0 */4 * * *"
                        value={customCron}
                        onChange={(e) => setCustomCron(e.target.value)}
                        helperText={t('scheduler.cronFormatHelper')}
                      />
                    )}
                  </div>
                )}

                {/* Days & Time mode */}
                {scheduleMode === 'days' && (
                  <div className="space-y-4" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
                    <div>
                      <p className="text-sm text-dark-400 mb-2">{t('scheduler.selectDaysOfWeek')}</p>
                      <div className="flex gap-2 flex-wrap">
                        {DAYS_OF_WEEK.map(day => (
                          <button
                            key={day.id}
                            onClick={() => toggleDay(day.id)}
                            className={`flex-1 min-w-[3rem] py-3 rounded-lg border-2 text-center text-sm font-medium transition-all ${
                              selectedDays.includes(day.id)
                                ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                                : 'border-dark-600 bg-dark-900/30 text-dark-400 hover:border-dark-500'
                            }`}
                            title={day.full}
                          >
                            {day.short}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
                          className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                        >
                          Weekdays
                        </button>
                        <span className="text-dark-600">|</span>
                        <button
                          onClick={() => setSelectedDays([0, 6])}
                          className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                        >
                          Weekends
                        </button>
                        <span className="text-dark-600">|</span>
                        <button
                          onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
                          className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                        >
                          Every Day
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-dark-400 mb-2">{t('scheduler.executionTime')}</p>
                      <div className="flex items-center gap-2">
                        <select
                          value={executionHour}
                          onChange={(e) => setExecutionHour(e.target.value)}
                          className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2.5 text-white text-sm focus:border-brand-500 focus:outline-none"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={String(i).padStart(2, '0')}>
                              {String(i).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                        <span className="text-dark-400 text-lg font-bold">:</span>
                        <select
                          value={executionMinute}
                          onChange={(e) => setExecutionMinute(e.target.value)}
                          className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2.5 text-white text-sm focus:border-brand-500 focus:outline-none"
                        >
                          {['00', '15', '30', '45'].map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <span className="text-dark-500 text-sm ml-2">UTC</span>
                      </div>
                    </div>

                    {selectedDays.length > 0 && (
                      <div className="p-3 bg-dark-900/50 rounded-lg border border-dark-700/50">
                        <p className="text-xs text-dark-400">
                          Cron: <code className="text-brand-400 bg-dark-700 px-1.5 py-0.5 rounded">
                            {`${executionMinute} ${executionHour} * * ${[...selectedDays].sort((a, b) => a - b).join(',')}`}
                          </code>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Interval mode */}
                {scheduleMode === 'interval' && (
                  <div className="space-y-3" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
                    <div className="grid grid-cols-4 gap-2">
                      {INTERVAL_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setIntervalMinutes(opt.value)}
                          className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                            intervalMinutes === opt.value
                              ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                              : 'border-dark-600 bg-dark-900/30 text-dark-400 hover:border-dark-500'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <Input
                      label={t('scheduler.customIntervalMinutes')}
                      type="number"
                      min="1"
                      value={intervalMinutes}
                      onChange={(e) => setIntervalMinutes(e.target.value)}
                      helperText={`Scan runs every ${intervalDisplayText}`}
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-2 border-t border-dark-700 gap-3">
                <p className="text-xs text-dark-500">{scheduleSummaryText}</p>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={handleCancelForm}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} isLoading={isCreating}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('scheduler.newSchedule')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {jobs.length > 0 && (
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            style={{ animation: 'fadeSlideIn 0.35s ease-out' }}
          >
            <div className="bg-dark-800/50 border border-dark-700/50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/15 rounded-lg">
                  <Calendar className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-dark-400 text-sm">{t('scheduler.totalJobs')}</p>
                  <p className="text-2xl font-bold text-white tabular-nums">{jobs.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-dark-800/50 border border-dark-700/50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/15 rounded-lg">
                  <Play className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-dark-400 text-sm">{t('scheduler.activeJobs')}</p>
                  <p className="text-2xl font-bold text-green-400 tabular-nums">{activeJobCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-dark-800/50 border border-dark-700/50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-500/15 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <p className="text-dark-400 text-sm">{t('scheduler.totalRuns')}</p>
                  <p className="text-2xl font-bold text-brand-400 tabular-nums">{totalRunCount}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Jobs List */}
        <div style={{ animation: 'fadeSlideIn 0.4s ease-out' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Scheduled Jobs
              <span className="text-dark-500 text-sm font-normal ml-2">
                {jobs.length} job{jobs.length !== 1 ? 's' : ''}
              </span>
            </h3>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 text-dark-400 animate-spin" />
            </div>
          ) : jobs.length === 0 ? (
            <Card>
              <div className="text-center py-16" style={{ animation: 'fadeSlideIn 0.4s ease-out' }}>
                <div className="w-20 h-20 bg-dark-700/30 rounded-full flex items-center justify-center mx-auto mb-5">
                  <Calendar className="w-10 h-10 text-dark-500" />
                </div>
                <p className="text-dark-300 font-semibold text-lg">{t('scheduler.noScheduledJobs')}</p>
                <p className="text-dark-500 text-sm mt-2 max-w-md mx-auto">
                    {t('scheduler.noScheduledJobsDesc')}
                  </p>
                <Button className="mt-6" onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('scheduler.newSchedule')}
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {jobs.map((job, idx) => (
                <div
                  key={job.id}
                  className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 hover:border-dark-600 transition-colors"
                  style={{ animation: `fadeSlideIn ${0.2 + idx * 0.06}s ease-out` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {/* Status indicator */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        job.status === 'active' ? 'bg-green-500/15' : 'bg-yellow-500/15'
                      }`}>
                        {job.status === 'active'
                          ? <Play className="w-5 h-5 text-green-400" />
                          : <Pause className="w-5 h-5 text-yellow-400" />
                        }
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <p className="font-semibold text-white text-lg truncate">{job.id}</p>
                          <span className={`px-2.5 py-0.5 text-xs rounded-full font-medium ${
                            job.status === 'active'
                              ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                              : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                          }`}>
                            {job.status}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded bg-dark-700 text-dark-300">
                            {job.scan_type}
                          </span>
                          {job.agent_role && (
                            <span className="px-2 py-0.5 text-xs rounded bg-brand-500/15 text-brand-400 border border-brand-500/30">
                              {job.agent_role.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 mt-2 text-sm text-dark-400 flex-wrap">
                          <span className="flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate max-w-[220px]">{job.target}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                            {job.schedule}
                          </span>
                          {job.run_count > 0 && (
                            <span className="flex items-center gap-1.5">
                              <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
                              {job.run_count} run{job.run_count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        {(job.next_run || job.last_run) && (
                          <div className="flex items-center gap-4 mt-1.5 text-xs text-dark-500 flex-wrap">
                            {job.next_run && (
                              <span title={new Date(job.next_run).toLocaleString()}>
                                {t('scheduler.next')}: {relativeTime(job.next_run, t)}
                              </span>
                            )}
                            {job.last_run && (
                              <span title={new Date(job.last_run).toLocaleString()}>
                                {t('scheduler.last')}: {relativeTime(job.last_run, t)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {job.status === 'active' ? (
                        <button
                          onClick={() => handlePause(job.id)}
                          title={t('scheduler.pauseSchedule')}
                          className="p-2 rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleResume(job.id)}
                          title={t('scheduler.resumeSchedule')}
                          className="p-2 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => setDeleteTarget(job.id)}
                        title={t('scheduler.deleteSchedule')}
                        className="p-2 rounded-lg text-dark-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
