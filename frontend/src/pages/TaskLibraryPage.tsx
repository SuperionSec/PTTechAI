import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BookOpen, Plus, Trash2, Play, Search, Tag, Zap, X, Save, RefreshCw,
  Layers, Star, PenTool, Inbox, AlertTriangle
} from 'lucide-react'
import Card from '../components/common/Card'
import Button from '../components/common/Button'
import Input from '../components/common/Input'
import Textarea from '../components/common/Textarea'
import { agentApi } from '../services/api'
import type { AgentTask } from '../types'

/* ─── Constants ────────────────────────────────────────────────── */

const getCategories = (t: any) => [
  { id: 'all', name: t('taskLibrary.allTasks'), color: 'dark' },
  { id: 'full_auto', name: t('taskLibrary.fullAuto'), color: 'primary' },
  { id: 'recon', name: t('taskLibrary.reconnaissance'), color: 'blue' },
  { id: 'vulnerability', name: t('taskLibrary.vulnerability'), color: 'orange' },
  { id: 'custom', name: t('taskLibrary.custom'), color: 'purple' },
  { id: 'reporting', name: t('taskLibrary.reporting'), color: 'green' }
]

/* ─── Toast System ─────────────────────────────────────────────── */

interface Toast { id: number; message: string; severity: 'info' | 'success' | 'warning' | 'error' }
let _toastId = 0

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  const border: Record<string, string> = {
    info: 'border-blue-500', success: 'border-green-500',
    warning: 'border-yellow-500', error: 'border-red-500',
  }
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`bg-dark-800 border-l-4 ${border[t.severity]} rounded-lg px-4 py-3 shadow-xl flex items-start gap-3`}
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

/* ─── Main Component ───────────────────────────────────────────── */

export default function TaskLibraryPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const CATEGORIES = useMemo(() => getCategories(t), [t])

  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Create task modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTask, setNewTask] = useState({
    name: '',
    description: '',
    category: 'custom',
    prompt: '',
    system_prompt: '',
    tags: ''
  })
  const [creating, setCreating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  /* ── Toast helpers ──────────────────────────────────────────── */

  const addToast = useCallback((message: string, severity: Toast['severity'] = 'info') => {
    const id = ++_toastId
    setToasts(prev => [...prev.slice(-4), { id, message, severity }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  /* ── Data fetch ─────────────────────────────────────────────── */

  const loadTasks = useCallback(async () => {
    try {
      const taskList = await agentApi.tasks.list()
      setTasks(taskList)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    loadTasks().finally(() => setLoading(false))
  }, [loadTasks])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadTasks()
    setRefreshing(false)
  }, [loadTasks])

  /* ── Derived data ───────────────────────────────────────────── */

  const filteredTasks = useMemo(() => {
    let filtered = [...tasks]

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(t => t.category === selectedCategory)
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags?.some(tag => tag.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [tasks, selectedCategory, searchQuery])

  const stats = useMemo(() => {
    const presetCount = tasks.filter(t => t.is_preset).length
    const customCount = tasks.filter(t => !t.is_preset).length
    const categoryCounts: Record<string, number> = {}
    CATEGORIES.filter(c => c.id !== 'all').forEach(cat => {
      categoryCounts[cat.id] = tasks.filter(t => t.category === cat.id).length
    })
    return { total: tasks.length, presetCount, customCount, categoryCounts }
  }, [tasks])

  /* ── Handlers ───────────────────────────────────────────────── */

  const handleCreateTask = useCallback(async () => {
    if (!newTask.name.trim() || !newTask.prompt.trim()) return

    setCreating(true)
    try {
      await agentApi.tasks.create({
        name: newTask.name,
        description: newTask.description,
        category: newTask.category,
        prompt: newTask.prompt,
        system_prompt: newTask.system_prompt || undefined,
        tags: newTask.tags.split(',').map(t => t.trim()).filter(t => t)
      })

      // Reload tasks
      await loadTasks()
      setShowCreateModal(false)
      setNewTask({
        name: '',
        description: '',
        category: 'custom',
        prompt: '',
        system_prompt: '',
        tags: ''
      })
      addToast(t('taskLibrary.taskCreated'), 'success')
    } catch (error) {
      console.error('Failed to create task:', error)
      addToast(t('taskLibrary.failedToCreateTask'), 'error')
    } finally {
      setCreating(false)
    }
  }, [newTask, loadTasks, addToast])

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      await agentApi.tasks.delete(taskId)
      await loadTasks()
      setDeleteConfirm(null)
      if (selectedTask?.id === taskId) {
        setSelectedTask(null)
      }
      addToast(t('taskLibrary.taskDeleted'), 'success')
    } catch (error) {
      console.error('Failed to delete task:', error)
      addToast(t('taskLibrary.failedToDeleteTask'), 'error')
    }
  }, [loadTasks, selectedTask, addToast])

  const handleRunTask = useCallback((task: AgentTask) => {
    // Navigate to new scan page with task pre-selected
    navigate('/scan/new', { state: { selectedTaskId: task.id } })
  }, [navigate])

  const handleSelectTask = useCallback((task: AgentTask) => {
    setSelectedTask(task)
  }, [])

  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  /* ── Loading state ──────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
      >
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary-500/10">
              <BookOpen className="w-7 h-7 text-primary-500" />
            </div>
            {t('taskLibrary.title')}
          </h1>
          <p className="text-dark-400 mt-1">{t('taskLibrary.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg bg-dark-800 border border-dark-700 text-dark-400 hover:text-white hover:border-dark-500 transition-all"
            title={t('taskLibrary.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t('taskLibrary.createTask')}
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      {tasks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Total Tasks */}
          <div
            className="bg-dark-800 rounded-xl border border-primary-500/20 p-4"
            style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-500/10">
                <Layers className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-white tabular-nums">{stats.total}</p>
                <p className="text-[11px] text-dark-400">{t('taskLibrary.totalTasks')}</p>
              </div>
            </div>
          </div>

          {/* Presets */}
          <div
            className="bg-dark-800 rounded-xl border border-yellow-500/20 p-4"
            style={{ animation: 'fadeSlideIn 0.3s ease-out 0.05s both' }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Star className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white tabular-nums">{stats.presetCount}</p>
                <p className="text-[11px] text-dark-400">{t('taskLibrary.presets')}</p>
              </div>
            </div>
          </div>

          {/* Custom */}
          <div
            className="bg-dark-800 rounded-xl border border-purple-500/20 p-4"
            style={{ animation: 'fadeSlideIn 0.3s ease-out 0.1s both' }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <PenTool className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white tabular-nums">{stats.customCount}</p>
                <p className="text-[11px] text-dark-400">{t('taskLibrary.custom')}</p>
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div
            className="bg-dark-800 rounded-xl border border-dark-700 p-4"
            style={{ animation: 'fadeSlideIn 0.3s ease-out 0.15s both' }}
          >
            <div className="flex flex-col gap-1">
              {CATEGORIES.filter(c => c.id !== 'all' && stats.categoryCounts[c.id] > 0).map(cat => {
                const colorMap: Record<string, string> = {
                  primary: 'text-primary-400 bg-primary-500/10',
                  blue: 'text-blue-400 bg-blue-500/10',
                  orange: 'text-orange-400 bg-orange-500/10',
                  purple: 'text-purple-400 bg-purple-500/10',
                  green: 'text-green-400 bg-green-500/10',
                }
                const cls = colorMap[cat.color] || 'text-dark-300 bg-dark-700'
                return (
                  <div key={cat.id} className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${cls}`}>
                      {cat.id}
                    </span>
                    <span className="text-sm text-white font-semibold tabular-nums">
                      {stats.categoryCounts[cat.id]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
              <input
                type="text"
                placeholder={t('taskLibrary.searchTasks')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:border-primary-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task List */}
        <div className="lg:col-span-2 space-y-3">
          {filteredTasks.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                {searchQuery || selectedCategory !== 'all' ? (
                  <>
                    <Search className="w-14 h-14 mx-auto text-dark-500 mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">{t('taskLibrary.noTasksMatch')}</h3>
                    <p className="text-dark-400 text-sm mb-4">
                      {t('taskLibrary.noTasksMatchDesc')}
                    </p>
                    <button
                      onClick={() => { setSearchQuery(''); setSelectedCategory('all') }}
                      className="text-primary-500 text-sm hover:underline"
                    >
                      {t('taskLibrary.clearFilters')}
                    </button>
                  </>
                ) : (
                  <>
                    <Inbox className="w-16 h-16 mx-auto text-dark-500 mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">{t('taskLibrary.noTasksYet')}</h3>
                    <p className="text-dark-400 text-sm mb-4">
                      {t('taskLibrary.createFirstTask')}
                    </p>
                    <Button onClick={() => setShowCreateModal(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      {t('taskLibrary.createTask')}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
              {filteredTasks.map((task, idx) => (
                <div
                  key={task.id}
                  onClick={() => handleSelectTask(task)}
                  className={`bg-dark-800 rounded-lg border p-4 cursor-pointer transition-all ${
                    selectedTask?.id === task.id
                      ? 'border-primary-500 bg-primary-500/5'
                      : 'border-dark-700 hover:border-dark-500'
                  }`}
                  style={{ animation: `fadeSlideIn 0.3s ease-out ${Math.min(idx * 0.04, 0.4)}s both` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{task.name}</span>
                        {task.is_preset && (
                          <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded">
                            {t('taskLibrary.preset')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-dark-400 line-clamp-2">{task.description}</p>

                      <div className="flex items-center gap-3 mt-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          task.category === 'full_auto' ? 'bg-primary-500/20 text-primary-400' :
                          task.category === 'recon' ? 'bg-blue-500/20 text-blue-400' :
                          task.category === 'vulnerability' ? 'bg-orange-500/20 text-orange-400' :
                          task.category === 'reporting' ? 'bg-green-500/20 text-green-400' :
                          'bg-purple-500/20 text-purple-400'
                        }`}>
                          {task.category}
                        </span>
                        {task.estimated_tokens > 0 && (
                          <span className="text-xs text-dark-500 flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            ~{task.estimated_tokens} {t('taskLibrary.tokens')}
                          </span>
                        )}
                      </div>

                      {task.tags?.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {task.tags.slice(0, 5).map((tag) => (
                            <span key={tag} className="text-xs bg-dark-700 text-dark-300 px-2 py-0.5 rounded flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {tag}
                            </span>
                          ))}
                          {task.tags.length > 5 && (
                            <span className="text-xs text-dark-500">+{task.tags.length - 5} {t('taskLibrary.more')}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRunTask(task)
                        }}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                      {!task.is_preset && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirm(task.id)
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Task Details */}
        <div>
          <Card title={t('taskLibrary.taskDetails')}>
            {selectedTask ? (
              <div className="space-y-4" style={{ animation: 'fadeSlideIn 0.3s ease-out' }}>
                <div>
                  <p className="text-sm text-dark-400">{t('taskLibrary.name')}</p>
                  <p className="text-white font-medium">{selectedTask.name}</p>
                </div>

                <div>
                  <p className="text-sm text-dark-400">{t('taskLibrary.description')}</p>
                  <p className="text-dark-300">{selectedTask.description}</p>
                </div>

                <div>
                  <p className="text-sm text-dark-400">{t('taskLibrary.category')}</p>
                  <p className="text-white">{selectedTask.category}</p>
                </div>

                <div>
                  <p className="text-sm text-dark-400">{t('taskLibrary.prompt')}</p>
                  <pre className="text-xs bg-dark-900 p-3 rounded-lg overflow-auto max-h-60 text-dark-300 whitespace-pre-wrap">
                    {selectedTask.prompt}
                  </pre>
                </div>

                {selectedTask.system_prompt && (
                  <div>
                    <p className="text-sm text-dark-400">{t('taskLibrary.systemPrompt')}</p>
                    <pre className="text-xs bg-dark-900 p-3 rounded-lg overflow-auto max-h-40 text-dark-300 whitespace-pre-wrap">
                      {selectedTask.system_prompt}
                    </pre>
                  </div>
                )}

                {selectedTask.tools_required?.length > 0 && (
                  <div>
                    <p className="text-sm text-dark-400">{t('taskLibrary.requiredTools')}</p>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {selectedTask.tools_required.map((tool) => (
                        <span key={tool} className="text-xs bg-dark-700 text-dark-300 px-2 py-1 rounded">
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-dark-700">
                  <Button
                    className="w-full"
                    onClick={() => handleRunTask(selectedTask)}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {t('taskLibrary.runThisTask')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <BookOpen className="w-10 h-10 mx-auto text-dark-500 mb-3" />
                <p className="text-dark-400 text-sm">
                  {t('taskLibrary.selectTaskToView')}
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <div
            className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-2xl max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'fadeSlideIn 0.2s ease-out' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-dark-700">
              <h3 className="text-xl font-bold text-white">{t('taskLibrary.createNewTask')}</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <Input
                label={t('taskLibrary.taskName')}
                placeholder={t('taskLibrary.taskNamePlaceholder')}
                value={newTask.name}
                onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
              />

              <Input
                label={t('taskLibrary.description')}
                placeholder={t('taskLibrary.descriptionPlaceholder')}
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              />

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">{t('taskLibrary.category')}</label>
                <select
                  value={newTask.category}
                  onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white focus:border-primary-500 focus:outline-none"
                >
                  <option value="custom">{t('taskLibrary.custom')}</option>
                  <option value="recon">{t('taskLibrary.reconnaissance')}</option>
                  <option value="vulnerability">{t('taskLibrary.vulnerability')}</option>
                  <option value="full_auto">{t('taskLibrary.fullAuto')}</option>
                  <option value="reporting">{t('taskLibrary.reporting')}</option>
                </select>
              </div>

              <Textarea
                label={t('taskLibrary.prompt')}
                placeholder={t('taskLibrary.promptPlaceholder')}
                rows={8}
                value={newTask.prompt}
                onChange={(e) => setNewTask({ ...newTask, prompt: e.target.value })}
              />

              <Textarea
                label={t('taskLibrary.systemPromptOptional')}
                placeholder={t('taskLibrary.systemPromptPlaceholder')}
                rows={4}
                value={newTask.system_prompt}
                onChange={(e) => setNewTask({ ...newTask, system_prompt: e.target.value })}
              />

              <Input
                label={t('taskLibrary.tagsCommaSeparated')}
                placeholder={t('taskLibrary.tagsPlaceholder')}
                value={newTask.tags}
                onChange={(e) => setNewTask({ ...newTask, tags: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-dark-700">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleCreateTask}
                isLoading={creating}
                disabled={!newTask.name.trim() || !newTask.prompt.trim()}
              >
                <Save className="w-4 h-4 mr-2" />
                {t('taskLibrary.createTask')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
          <div
            className="bg-dark-800 rounded-xl border border-dark-700 p-6 max-w-md"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'fadeSlideIn 0.2s ease-out' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">{t('taskLibrary.deleteTask')}</h3>
            </div>
            <p className="text-dark-400 mb-6">
              {t('taskLibrary.deleteTaskConfirm')}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" onClick={() => handleDeleteTask(deleteConfirm)}>
                <Trash2 className="w-4 h-4 mr-2" />
                {t('common.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
