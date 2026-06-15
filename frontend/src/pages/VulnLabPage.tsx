import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  Progress,
  Row,
  Col,
  Popconfirm,
  Select,
  Space,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import {
  BarChartOutlined,
  BugOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  DeleteOutlined,
  EyeOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LockOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { vulnLabApi } from '../services/api'
import type { VulnLabChallenge, VulnLabLogEntry, VulnLabRealtimeStatus, VulnLabStats, VulnTypeCategory } from '../types'
import { isLogContainerNearBottom } from '../utils/logScroll'

const { Text } = Typography
const { TextArea } = Input

type ChallengeDetail = Omit<VulnLabRealtimeStatus, 'status'> & Partial<Omit<VulnLabChallenge, 'status'>> & { status: string }
type ActiveTab = 'test' | 'history' | 'stats'

interface FormValues {
  target_url: string
  challenge_name?: string
  vuln_type: string
  auth_type?: string
  auth_value?: string
  notes?: string
}

const severityColors: Record<string, string> = {
  critical: 'red',
  high: 'volcano',
  medium: 'orange',
  low: 'blue',
  info: 'default',
}

const statusColors: Record<string, string> = {
  running: 'processing',
  completed: 'success',
  failed: 'error',
  error: 'error',
  stopped: 'warning',
  pending: 'default',
  paused: 'warning',
}

const resultColors: Record<string, string> = {
  detected: 'green',
  not_detected: 'red',
  error: 'orange',
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return '-'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}m ${rest}s`
}

function resultLabel(result: string | null | undefined, t: (key: string) => string) {
  if (!result) return '-'
  const key = result === 'not_detected' ? 'notDetected' : result
  return t(`vulnLab.result.${key}`)
}

function statusLabel(status: string, t: (key: string) => string) {
  return t(`vulnLab.status.${status}`)
}

function LogTimeline({ logs, maxHeight = 360 }: { logs: VulnLabLogEntry[]; maxHeight?: number }) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<'all' | 'info' | 'warning' | 'error'>('all')
  const filtered = filter === 'all' ? logs : logs.filter(log => log.level === filter)

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Space wrap>
        {(['all', 'info', 'warning', 'error'] as const).map(level => (
          <Button key={level} size="small" type={filter === level ? 'primary' : 'default'} onClick={() => setFilter(level)}>
            {t(`vulnLab.logLevel.${level}`)}
          </Button>
        ))}
      </Space>
      <div style={{ maxHeight, overflow: 'auto', padding: 12, background: '#0f172a', borderRadius: 8 }}>
        {filtered.length ? (
          <Timeline
            items={filtered.map(log => ({
              color: log.level === 'error' ? 'red' : log.level === 'warning' ? 'orange' : log.level === 'critical' ? 'red' : log.source === 'llm' ? 'purple' : 'blue',
              children: (
                <Space direction="vertical" size={2}>
                  <Space wrap>
                    <Text style={{ color: '#94a3b8' }}>{log.time ? new Date(log.time).toLocaleTimeString() : ''}</Text>
                    <Tag color={log.level === 'error' ? 'red' : log.level === 'warning' ? 'orange' : 'blue'}>{log.level}</Tag>
                    {log.source === 'llm' && <Tag color="purple">AI</Tag>}
                  </Space>
                  <Text style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.message}</Text>
                </Space>
              ),
            }))}
          />
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('vulnLab.noLogsMatch')} />}
      </div>
    </Space>
  )
}

function DetectionDonut({ stats }: { stats: { result_counts?: { detected?: number; not_detected?: number; error?: number } } }) {
  const rc = stats.result_counts || {}
  const detected = rc.detected || 0
  const notDetected = rc.not_detected || 0
  const errorCount = rc.error || 0
  if (detected + notDetected + errorCount === 0) return null
  const data = [
    { name: 'Detected', value: detected, color: '#22c55e' },
    { name: 'Not Detected', value: notDetected, color: '#ef4444' },
    ...(errorCount > 0 ? [{ name: 'Error', value: errorCount, color: '#eab308' }] : []),
  ]
  return (
    <Flex align="center" gap={16} style={{ padding: '8px 0' }}>
      <ResponsiveContainer width={96} height={96}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={38} innerRadius={20} strokeWidth={0} paddingAngle={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} itemStyle={{ color: '#e2e8f0' }} />
        </PieChart>
      </ResponsiveContainer>
      <Space direction="vertical" size={4}>
        {data.map(d => (
          <Flex key={d.name} align="center" gap={8}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: d.color, flexShrink: 0 }} />
            <Typography.Text style={{ fontSize: 12 }}>{d.name}</Typography.Text>
            <Typography.Text strong style={{ fontSize: 12, marginLeft: 'auto' }}>{d.value}</Typography.Text>
          </Flex>
        ))}
      </Space>
    </Flex>
  )
}

export default function VulnLabPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { notification } = AntApp.useApp()
  const [form] = Form.useForm<FormValues>()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logScrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  const [categories, setCategories] = useState<Record<string, VulnTypeCategory>>({})
  const [challenges, setChallenges] = useState<VulnLabChallenge[]>([])
  const [stats, setStats] = useState<VulnLabStats | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('test')
  const [isRunning, setIsRunning] = useState(false)
  const [runningChallengeId, setRunningChallengeId] = useState<string | null>(null)
  const [runningStatus, setRunningStatus] = useState<ChallengeDetail | null>(null)
  const [runningLogs, setRunningLogs] = useState<VulnLabLogEntry[]>([])
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warning' | 'error'>('all')
  const [showAuth, setShowAuth] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [selectedVulnType, setSelectedVulnType] = useState('')
  const [expandedChallenge, setExpandedChallenge] = useState<string | null>(null)
  const [expandedChallengeData, setExpandedChallengeData] = useState<ChallengeDetail | null>(null)
  const [loadingChallenge, setLoadingChallenge] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadChallenges = useCallback(async () => {
    try {
      const data = await vulnLabApi.listChallenges({ limit: 50 })
      setChallenges(data.challenges || [])
    } catch {
      // ignore
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      setStats(await vulnLabApi.getStats())
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    vulnLabApi.getTypes().then(data => setCategories(data.categories)).catch(() => {})
    loadChallenges()
    loadStats()
  }, [loadChallenges, loadStats])

  useEffect(() => {
    if (!autoScrollRef.current || !logScrollRef.current) return
    logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight
  }, [runningLogs])

  useEffect(() => {
    if (!runningChallengeId || !isRunning) return

    const poll = async () => {
      try {
        const status = await vulnLabApi.getChallenge(runningChallengeId)
        const detail = status as ChallengeDetail
        setRunningStatus(detail)
        if (detail.logs) setRunningLogs(detail.logs)
        if (['completed', 'failed', 'stopped', 'error'].includes(detail.status)) {
          setIsRunning(false)
          if (pollRef.current) window.clearInterval(pollRef.current)
          loadChallenges()
          loadStats()
          if (detail.status === 'completed') {
            notification[detail.result === 'detected' ? 'success' : 'info']({
              message: detail.result === 'detected' ? t('vulnLab.vulnDetected') : detail.result === 'not_detected' ? t('vulnLab.testCompleteNotDetected') : t('vulnLab.testCompleted'),
            })
          } else if (detail.status === 'failed' || detail.status === 'error') {
            notification.error({ message: t('vulnLab.testFailed') })
          }
        }
      } catch {
        // ignore
      }
    }

    poll()
    pollRef.current = window.setInterval(poll, 3000)
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [isRunning, loadChallenges, loadStats, notification, runningChallengeId, t])

  const allTypes = useMemo(() => Object.entries(categories).flatMap(([categoryKey, category]) => category.types.map(type => ({ ...type, categoryKey, categoryLabel: category.label }))), [categories])
  const selectedInfo = useMemo(() => allTypes.find(type => type.key === selectedVulnType), [allTypes, selectedVulnType])
  const filteredCategories = useMemo(() => Object.entries(categories).map(([key, category]) => ({
    key,
    ...category,
    types: searchFilter ? category.types.filter(type => type.key.toLowerCase().includes(searchFilter.toLowerCase()) || type.title.toLowerCase().includes(searchFilter.toLowerCase())) : category.types,
  })).filter(category => category.types.length > 0), [categories, searchFilter])
  const filteredLogs = logFilter === 'all' ? runningLogs : runningLogs.filter(log => log.level === logFilter)

  const handleStart = useCallback(async () => {
    const values = await form.validateFields()
    setError(null)
    setIsRunning(true)
    setRunningStatus(null)
    setRunningLogs([])
    try {
      const response = await vulnLabApi.run({
        target_url: values.target_url.trim(),
        vuln_type: values.vuln_type,
        challenge_name: values.challenge_name || undefined,
        auth_type: values.auth_type || undefined,
        auth_value: values.auth_value || undefined,
        notes: values.notes || undefined,
      })
      setRunningChallengeId(response.challenge_id)
      notification.success({ message: t('vulnLab.testStarted') })
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { detail?: string } }; message?: string }
      setError(apiError.response?.data?.detail || apiError.message || t('vulnLab.failedToStart'))
      setIsRunning(false)
    }
  }, [form, notification, t])

  const handleStop = useCallback(async () => {
    if (!runningChallengeId) return
    try {
      await vulnLabApi.stopChallenge(runningChallengeId)
      setIsRunning(false)
      notification.info({ message: t('vulnLab.testStopped') })
    } catch {
      // ignore
    }
  }, [notification, runningChallengeId, t])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await vulnLabApi.deleteChallenge(id)
      if (expandedChallenge === id) {
        setExpandedChallenge(null)
        setExpandedChallengeData(null)
      }
      await Promise.all([loadChallenges(), loadStats()])
      notification.success({ message: t('vulnLab.challengeDeleted') })
    } catch {
      notification.error({ message: t('vulnLab.failedToDelete') })
    }
  }, [expandedChallenge, loadChallenges, loadStats, notification, t])

  const toggleChallengeExpand = useCallback(async (challengeId: string) => {
    if (expandedChallenge === challengeId) {
      setExpandedChallenge(null)
      setExpandedChallengeData(null)
      return
    }
    setExpandedChallenge(challengeId)
    setLoadingChallenge(true)
    try {
      setExpandedChallengeData(await vulnLabApi.getChallenge(challengeId) as ChallengeDetail)
    } catch {
      setExpandedChallengeData(null)
    } finally {
      setLoadingChallenge(false)
    }
  }, [expandedChallenge])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadChallenges(), loadStats()])
    setRefreshing(false)
    notification.info({ message: t('vulnLab.dataRefreshed') })
  }, [loadChallenges, loadStats, notification, t])

  const columns: ProColumns<VulnLabChallenge>[] = [
    {
      title: t('vulnLab.challengeName'),
      dataIndex: 'challenge_name',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.challenge_name || record.vuln_type.replace(/_/g, ' ')}</Text>
          <Text type="secondary" ellipsis style={{ maxWidth: 320 }}>{record.target_url}</Text>
        </Space>
      ),
    },
    { title: t('vulnLab.vulnType'), dataIndex: 'vuln_type', render: (_, record) => <Tag>{record.vuln_type}</Tag> },
    { title: t('vulnLab.statusLabel'), dataIndex: 'status', render: (_, record) => <Tag color={statusColors[record.status]}>{statusLabel(record.status, t)}</Tag> },
    { title: t('vulnLab.resultLabel'), dataIndex: 'result', render: (_, record) => record.result ? <Tag color={resultColors[record.result]}>{resultLabel(record.result, t)}</Tag> : '-' },
    {
      title: t('vulnLab.findings'),
      dataIndex: 'findings_count',
      render: (_, record) => (
        <Space wrap>
          <Tag color={record.findings_count ? 'green' : 'default'}>{record.findings_count}</Tag>
          {(['critical', 'high', 'medium', 'low', 'info'] as const).map(severity => {
            const count = record[`${severity}_count` as keyof VulnLabChallenge] as number
            return count ? <Tag key={severity} color={severityColors[severity]}>{severity}: {count}</Tag> : null
          })}
        </Space>
      ),
    },
    { title: t('agent.duration'), dataIndex: 'duration', render: (_, record) => formatDuration(record.duration) },
    {
      title: t('common.actions'),
      valueType: 'option',
      render: (_, record) => [
        <Button key="detail" size="small" icon={<EyeOutlined />} onClick={() => toggleChallengeExpand(record.id)}>{expandedChallenge === record.id ? t('common.close') : t('common.view')}</Button>,
        record.scan_id && <Button key="scan" size="small" icon={<GlobalOutlined />} onClick={() => navigate(`/scan/${record.scan_id}`)}>{t('vulnLab.viewScanDetails')}</Button>,
        <Popconfirm key="delete" title={t('common.delete')} onConfirm={() => handleDelete(record.id)}><Button size="small" danger icon={<DeleteOutlined />}>{t('common.delete')}</Button></Popconfirm>,
      ].filter(Boolean),
    },
  ]

  return (
    <PageContainer title={<Space><ExperimentOutlined />{t('vulnLab.title')}</Space>} subTitle={t('vulnLab.subtitle')}>
      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key as ActiveTab)}
        items={[
          { key: 'test', label: <Space><PlayCircleOutlined />{t('vulnLab.newTest')}</Space> },
          { key: 'history', label: <Space><ClockCircleOutlined />{t('vulnLab.history')}</Space> },
          { key: 'stats', label: <Space><BarChartOutlined />{t('vulnLab.stats')}</Space> },
        ]}
      />

      {activeTab === 'test' && (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <ProCard bordered title={t('vulnLab.newTest')}>
              <Form form={form} layout="vertical" requiredMark={false} onValuesChange={(_, values) => setSelectedVulnType(values.vuln_type || '')}>
                <Form.Item name="target_url" label={t('vulnLab.targetUrl')} rules={[{ required: true, message: t('vulnLab.targetPlaceholder') }]}>
                  <Input size="large" prefix={<GlobalOutlined />} placeholder={t('vulnLab.targetPlaceholder')} disabled={isRunning} />
                </Form.Item>
                <Form.Item name="challenge_name" label={t('vulnLab.challengeName')}>
                  <Input placeholder={t('vulnLab.challengePlaceholder')} disabled={isRunning} />
                </Form.Item>
                <Form.Item label={t('vulnLab.vulnType')} required>
                  <Input prefix={<SearchOutlined />} value={searchFilter} onChange={event => setSearchFilter(event.target.value)} placeholder={t('vulnLab.searchPlaceholder')} disabled={isRunning} style={{ marginBottom: 12 }} />
                  <Form.Item name="vuln_type" noStyle rules={[{ required: true, message: t('vulnLab.vulnType') }]}>
                    <Select
                      showSearch
                      disabled={isRunning}
                      placeholder={t('vulnLab.vulnType')}
                      optionFilterProp="label"
                      options={filteredCategories.flatMap(category => category.types.map(type => ({
                        label: `${type.title} ${type.cwe_id ? `(${type.cwe_id})` : ''}`,
                        value: type.key,
                        category: category.label,
                      })))}
                    />
                  </Form.Item>
                </Form.Item>
                {selectedInfo && <Alert style={{ marginBottom: 16 }} type="info" showIcon message={<Space><Tag color={severityColors[selectedInfo.severity]}>{selectedInfo.severity}</Tag>{selectedInfo.title}{selectedInfo.cwe_id && <Tag>{selectedInfo.cwe_id}</Tag>}</Space>} description={selectedInfo.description} />}
                <Button style={{ marginBottom: 16 }} icon={<LockOutlined />} onClick={() => setShowAuth(!showAuth)}>{t('vulnLab.authOptional')}</Button>
                {showAuth && (
                  <Row gutter={12}>
                    <Col span={8}>
                      <Form.Item name="auth_type" label={t('vulnLab.authOptional')}>
                        <Select allowClear options={[
                          { value: 'bearer', label: t('vulnLab.bearerToken') },
                          { value: 'cookie', label: t('vulnLab.cookie') },
                          { value: 'basic', label: t('vulnLab.basicAuth') },
                          { value: 'header', label: t('vulnLab.customHeader') },
                        ]} />
                      </Form.Item>
                    </Col>
                    <Col span={16}>
                      <Form.Item name="auth_value" label="Value"><Input.Password /></Form.Item>
                    </Col>
                  </Row>
                )}
                <Form.Item name="notes" label={t('vulnLab.notes')}>
                  <TextArea rows={3} placeholder={t('vulnLab.notesPlaceholder')} disabled={isRunning} />
                </Form.Item>
                {error && <Alert style={{ marginBottom: 16 }} type="error" showIcon message={error} />}
                {isRunning ? (
                  <Button danger size="large" block icon={<StopOutlined />} onClick={handleStop}>{t('vulnLab.stopTest')}</Button>
                ) : (
                  <Button type="primary" size="large" block icon={<ExperimentOutlined />} onClick={handleStart}>{t('vulnLab.startTest')}</Button>
                )}
              </Form>
            </ProCard>
          </Col>

          <Col xs={24} lg={12}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {runningStatus ? (
                <ProCard bordered title={<Space><BugOutlined />{selectedInfo?.title || runningStatus.vuln_type || selectedVulnType}</Space>} extra={<Tag color={statusColors[runningStatus.status]}>{statusLabel(runningStatus.status, t)}</Tag>}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Progress percent={runningStatus.progress || 0} status={runningStatus.status === 'error' || runningStatus.status === 'failed' ? 'exception' : runningStatus.status === 'completed' ? 'success' : 'active'} />
                    <Descriptions size="small" column={2} bordered>
                      <Descriptions.Item label={t('agent.phaseToast', { phase: '' })}>{runningStatus.phase || '-'}</Descriptions.Item>
                      <Descriptions.Item label={t('vulnLab.findings')}>{runningStatus.findings_count || 0}</Descriptions.Item>
                      <Descriptions.Item label={t('vulnLab.logs')}>{runningLogs.length}</Descriptions.Item>
                      <Descriptions.Item label={t('vulnLab.resultLabel')}>{runningStatus.result ? resultLabel(runningStatus.result, t) : '-'}</Descriptions.Item>
                    </Descriptions>
                    {runningStatus.error && <Alert type="error" showIcon message={runningStatus.error} />}
                    {runningStatus.scan_id && <Button icon={<EyeOutlined />} onClick={() => navigate(`/scan/${runningStatus.scan_id}`)}>{t('vulnLab.viewScanDetails')}</Button>}
                    {runningStatus.findings?.length ? (
                      <Collapse items={runningStatus.findings.slice(-5).map((finding: any, index: number) => ({
                        key: String(index),
                        label: <Space><Tag color={severityColors[finding.severity || 'medium']}>{finding.severity || 'medium'}</Tag>{finding.title || finding.vulnerability_type || t('vulnLab.finding')}</Space>,
                        children: <Descriptions size="small" column={1} bordered>{finding.affected_endpoint && <Descriptions.Item label={t('agent.endpointLabel')}>{finding.affected_endpoint}</Descriptions.Item>}{finding.payload && <Descriptions.Item label={t('vulnLab.payload')}><Text code>{finding.payload}</Text></Descriptions.Item>}{finding.evidence && <Descriptions.Item label={t('vulnLab.evidence')}>{finding.evidence}</Descriptions.Item>}</Descriptions>,
                      }))} />
                    ) : null}
                  </Space>
                </ProCard>
              ) : <ProCard bordered><Empty description={t('vulnLab.startFirstChallenge')} /></ProCard>}

              <ProCard bordered title={<Space><CodeOutlined />{t('vulnLab.liveAgentLogs')}<Tag>{runningLogs.length}</Tag></Space>}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space wrap>{(['all', 'info', 'warning', 'error'] as const).map(level => <Button key={level} size="small" type={logFilter === level ? 'primary' : 'default'} onClick={() => setLogFilter(level)}>{t(`vulnLab.logLevel.${level}`)}</Button>)}</Space>
                  <div ref={logScrollRef} onScroll={event => { autoScrollRef.current = isLogContainerNearBottom(event.currentTarget) }} style={{ maxHeight: 320, overflow: 'auto', padding: 12, background: '#0f172a', borderRadius: 8 }}>
                    {filteredLogs.length ? <Timeline items={filteredLogs.map(log => ({ color: log.level === 'error' ? 'red' : log.level === 'warning' ? 'orange' : log.source === 'llm' ? 'purple' : 'blue', children: <Space direction="vertical" size={2}><Text style={{ color: '#94a3b8' }}>{log.time ? new Date(log.time).toLocaleTimeString() : ''} <Tag>{log.level}</Tag>{log.source === 'llm' && <Tag color="purple">AI</Tag>}</Text><Text style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>{log.message}</Text></Space> }))} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('vulnLab.waitingLogs')} />}
                  </div>
                </Space>
              </ProCard>
            </Space>
          </Col>
        </Row>
      )}

      {activeTab === 'history' && (
        <ProCard bordered title={<Space><ClockCircleOutlined />{t('vulnLab.challengeHistory')}<Tag>{challenges.length}</Tag></Space>} extra={<Button icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh}>{t('common.refresh')}</Button>}>
          <ProTable<VulnLabChallenge>
            rowKey="id"
            search={false}
            options={false}
            dataSource={challenges}
            columns={columns}
            pagination={{ pageSize: 10 }}
            expandable={{
              expandedRowKeys: expandedChallenge ? [expandedChallenge] : [],
              onExpand: (_, record) => toggleChallengeExpand(record.id),
              expandedRowRender: () => loadingChallenge ? <Empty description={t('vulnLab.loadingDetails')} /> : expandedChallengeData ? (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {(expandedChallengeData.findings_detail || expandedChallengeData.findings || []).length ? (
                    <Collapse items={(expandedChallengeData.findings_detail || expandedChallengeData.findings || []).map((finding: any, index: number) => ({
                      key: String(index),
                      label: <Space><Tag color={severityColors[finding.severity || 'medium']}>{finding.severity || 'medium'}</Tag>{finding.title || finding.vulnerability_type || t('vulnLab.finding')}</Space>,
                      children: <Descriptions bordered column={1} size="small">{finding.vulnerability_type && <Descriptions.Item label={t('vulnLab.type')}>{finding.vulnerability_type}</Descriptions.Item>}{finding.affected_endpoint && <Descriptions.Item label={t('agent.endpointLabel')}>{finding.affected_endpoint}</Descriptions.Item>}{finding.payload && <Descriptions.Item label={t('vulnLab.payload')}><Text code>{finding.payload}</Text></Descriptions.Item>}{finding.evidence && <Descriptions.Item label={t('vulnLab.evidence')}>{finding.evidence}</Descriptions.Item>}</Descriptions>,
                    }))} />
                  ) : <Empty description={t('vulnLab.noFindings')} />}
                  {expandedChallengeData.logs?.length ? <LogTimeline logs={expandedChallengeData.logs} /> : null}
                  {expandedChallengeData.notes && <Alert type="info" showIcon icon={<FileTextOutlined />} message={t('vulnLab.notesTitle')} description={expandedChallengeData.notes} />}
                </Space>
              ) : <Empty description={t('vulnLab.failedToLoad')} />,
            }}
          />
        </ProCard>
      )}

      {activeTab === 'stats' && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {!stats ? <ProCard><Empty description={t('common.loading')} /></ProCard> : stats.total === 0 ? (
            <ProCard bordered><Empty description={t('vulnLab.noTestData')}><Button type="primary" onClick={() => setActiveTab('test')}>{t('vulnLab.startTesting')}</Button></Empty></ProCard>
          ) : (
            <>
              <StatisticCard.Group direction="row">
                <StatisticCard statistic={{ title: t('vulnLab.totalTests'), value: stats.total, icon: <ExperimentOutlined /> }} />
                <StatisticCard statistic={{ title: t('vulnLab.runningShort'), value: stats.running, icon: <ClockCircleOutlined /> }} />
                <StatisticCard statistic={{ title: t('vulnLab.detectionRate'), value: `${stats.detection_rate}%`, icon: <CheckCircleOutlined /> }} />
                <StatisticCard statistic={{ title: t('vulnLab.detectedShort'), value: stats.result_counts?.detected || 0, icon: <WarningOutlined /> }} />
              </StatisticCard.Group>
              {stats.result_counts && (Object.values(stats.result_counts).some(v => (v || 0) > 0)) && (
                <ProCard bordered title={t('vulnLab.detectionOverview', 'Detection Overview')}>
                  <DetectionDonut stats={stats} />
                </ProCard>
              )}
              {Object.keys(stats.by_category || {}).length > 0 && (
                <ProCard bordered title={t('vulnLab.detectionByCategory')} extra={<Button icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh}>{t('common.refresh')}</Button>}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {Object.entries(stats.by_category).map(([category, data]) => {
                      const rate = data.total > 0 ? Math.round((data.detected / data.total) * 100) : 0
                      return <div key={category}><Row justify="space-between"><Text>{categories[category]?.label || category}</Text><Text>{data.detected}/{data.total} ({rate}%)</Text></Row><Progress percent={rate} strokeColor={rate >= 70 ? '#52c41a' : rate >= 40 ? '#faad14' : '#ff4d4f'} /></div>
                    })}
                  </Space>
                </ProCard>
              )}
              {Object.keys(stats.by_type || {}).length > 0 && (
                <ProCard bordered title={t('vulnLab.detectionByType')}>
                  <Row gutter={[12, 12]}>
                    {Object.entries(stats.by_type).map(([type, data]) => {
                      const rate = data.total > 0 ? Math.round((data.detected / data.total) * 100) : 0
                      return <Col key={type} xs={24} sm={12} lg={8}><Card size="small"><Space direction="vertical" style={{ width: '100%' }}><Text ellipsis>{type.replace(/_/g, ' ')}</Text><Progress percent={rate} size="small" /><Text type="secondary">{data.detected}/{data.total}</Text></Space></Card></Col>
                    })}
                  </Row>
                </ProCard>
              )}
            </>
          )}
        </Space>
      )}
    </PageContainer>
  )
}
