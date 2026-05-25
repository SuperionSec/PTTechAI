import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Empty,
  Flex,
  List,
  Progress,
  Segmented,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  AlertOutlined,
  ApiOutlined,
  BugOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  GlobalOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { relativeTime } from '../utils/time'
import { dashboardApi, agentApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { canAccessPath } from '../routes/access'
import { useDashboardStore } from '../store'
import type { ActivityFeedItem } from '../types'
import type { TFunction } from 'i18next'

const { Text, Title } = Typography

type ActivityFilter = 'all' | 'scan' | 'vulnerability' | 'agent_task' | 'report'

interface ActiveAgent {
  agent_id: string
  target: string
  status: string
  progress: number
  phase: string
  scan_id: string | null
  started_at: string
  findings_count: number
  mode: string
}

const severityColors: Record<string, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'gold',
  low: 'blue',
  info: 'default',
}

const statusColors: Record<string, string> = {
  running: 'processing',
  completed: 'success',
  stopped: 'warning',
  failed: 'error',
  pending: 'default',
  paused: 'warning',
}

function statusLabel(status: string, t: TFunction) {
  const labels: Record<string, string> = {
    running: t('common.running', 'Running'),
    completed: t('common.completed', 'Completed'),
    stopped: t('common.stopped', 'Stopped'),
    failed: t('common.failed', 'Failed'),
    pending: t('common.pending', 'Pending'),
    paused: t('common.paused', 'Paused'),
  }
  return labels[status] ?? status
}

function severityLabel(severity: string, t: TFunction) {
  return t(`severity.${severity}`, severity)
}

function ActivityIcon({ type }: { type: ActivityFeedItem['type'] }) {
  if (type === 'scan') return <SafetyCertificateOutlined />
  if (type === 'vulnerability') return <AlertOutlined />
  if (type === 'agent_task') return <RobotOutlined />
  return <FileTextOutlined />
}

function DistributionCard({
  title,
  data,
}: {
  title: string
  data: Array<{ name: string; value: number; color: string }>
}) {
  const { t } = useTranslation()
  const filtered = data.filter(item => item.value > 0)
  const total = filtered.reduce((sum, item) => sum + item.value, 0)

  return (
    <ProCard title={title} bordered>
      {filtered.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.noData', 'No data')} />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {filtered.map(item => {
            const percent = total > 0 ? Math.round((item.value / total) * 100) : 0
            return (
              <div key={item.name}>
                <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
                  <Space>
                    <Badge color={item.color} />
                    <Text>{item.name}</Text>
                  </Space>
                  <Text strong>{item.value}</Text>
                </Flex>
                <Progress percent={percent} strokeColor={item.color} size="small" />
              </div>
            )
          })}
        </Space>
      )}
    </ProCard>
  )
}

function ActiveAgentItem({ agent }: { agent: ActiveAgent }) {
  return (
    <Link to={agent.scan_id ? `/scan/${agent.scan_id}` : '#'}>
      <ProCard hoverable bordered style={{ marginBottom: 8 }} bodyStyle={{ padding: 16 }}>
        <Flex align="center" gap={16}>
          <Badge status={agent.status === 'running' ? 'processing' : 'warning'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Flex align="center" gap={8} wrap="wrap">
              <Text strong ellipsis style={{ maxWidth: 360 }}>{agent.target}</Text>
              <Tag>{agent.mode.replace('_', ' ')}</Tag>
              {agent.findings_count > 0 && <Tag color="red"><BugOutlined /> {agent.findings_count}</Tag>}
            </Flex>
            <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
              <Progress percent={agent.progress} size="small" status={agent.status === 'running' ? 'active' : 'normal'} />
              <Text type="secondary">{agent.phase}</Text>
            </Space>
          </div>
          <RightOutlined />
        </Flex>
      </ProCard>
    </Link>
  )
}

export default function HomePage() {
  const { t } = useTranslation()
  const { userPermissions } = useAuth()
  const { notification } = AntApp.useApp()
  const {
    stats,
    recentScans,
    recentVulnerabilities,
    setStats,
    setRecentScans,
    setRecentVulnerabilities,
    setLoading,
  } = useDashboardStore()

  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([])
  const [activeAgents, setActiveAgents] = useState<ActiveAgent[]>([])
  const [maxConcurrent, setMaxConcurrent] = useState(5)
  const [connectionLost, setConnectionLost] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')

  const consecutiveErrorsRef = useRef(0)
  const prevFindingsCountRef = useRef(-1)
  const prevRunningCountRef = useRef(-1)

  const notify = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    notification[type]({ message })
  }, [notification])

  const fetchData = useCallback(async () => {
    try {
      const [statsData, recentData, activityData, agentsData] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getRecent(5),
        dashboardApi.getActivityFeed(20),
        agentApi.listActive().catch(() => ({ agents: [] as ActiveAgent[], max_concurrent: 5, running_count: 0 })),
      ])

      setStats(statsData)
      setRecentScans(recentData.recent_scans)
      setRecentVulnerabilities(recentData.recent_vulnerabilities)
      setActivityFeed(activityData.activities)
      setActiveAgents(agentsData.agents || [])
      setMaxConcurrent(agentsData.max_concurrent || 5)

      const totalFindings = statsData.vulnerabilities.total
      if (prevFindingsCountRef.current >= 0 && totalFindings > prevFindingsCountRef.current) {
        notify(`${totalFindings - prevFindingsCountRef.current}${t('dashboard.newFinding')}`, 'warning')
      }
      prevFindingsCountRef.current = totalFindings

      const runningCount = (agentsData.agents || []).filter((agent: ActiveAgent) => agent.status === 'running').length
      if (prevRunningCountRef.current > 0 && runningCount < prevRunningCountRef.current) {
        notify(t('dashboard.scanCompleted'), 'success')
      }
      prevRunningCountRef.current = runningCount

      if (consecutiveErrorsRef.current >= 3) {
        setConnectionLost(false)
        notify(t('dashboard.connectionRestored'), 'success')
      }
      consecutiveErrorsRef.current = 0
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
      consecutiveErrorsRef.current++
      if (consecutiveErrorsRef.current >= 3) setConnectionLost(true)
    }
  }, [setStats, setRecentScans, setRecentVulnerabilities, notify, t])

  useEffect(() => {
    setLoading(true)
    fetchData().finally(() => setLoading(false))
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData, setLoading])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }, [fetchData])

  const severityData = useMemo(() => [
    { name: t('severity.critical'), value: stats?.vulnerabilities.critical || 0, color: '#ff4d4f' },
    { name: t('severity.high'), value: stats?.vulnerabilities.high || 0, color: '#fa8c16' },
    { name: t('severity.medium'), value: stats?.vulnerabilities.medium || 0, color: '#fadb14' },
    { name: t('severity.low'), value: stats?.vulnerabilities.low || 0, color: '#1677ff' },
    { name: t('severity.info'), value: stats?.vulnerabilities.info || 0, color: '#8c8c8c' },
  ], [stats, t])

  const scanStatusData = useMemo(() => [
    { name: t('common.running'), value: stats?.scans.running || 0, color: '#52c41a' },
    { name: t('common.completed'), value: stats?.scans.completed || 0, color: '#1677ff' },
    { name: t('common.stopped'), value: stats?.scans.stopped || 0, color: '#faad14' },
    { name: t('common.failed'), value: stats?.scans.failed || 0, color: '#ff4d4f' },
    { name: t('common.pending'), value: stats?.scans.pending || 0, color: '#8c8c8c' },
  ], [stats, t])

  const filteredActivity = useMemo(() => {
    if (activityFilter === 'all') return activityFeed
    return activityFeed.filter(activity => activity.type === activityFilter)
  }, [activityFeed, activityFilter])

  const quickActions = useMemo(() => [
    { label: t('dashboard.autoPentest'), description: t('dashboard.streamAiTesting'), icon: <ThunderboltOutlined />, to: '/auto', color: '#52c41a', permission: 'agent:execute' },
    { label: t('dashboard.fullIaTesting'), description: t('dashboard.vulnTypes'), icon: <SafetyCertificateOutlined />, to: '/full-ia', color: '#ff4d4f', permission: 'agent:execute' },
    { label: t('sidebar.vulnLab'), description: t('dashboard.perTypeChallenges'), icon: <ExperimentOutlined />, to: '/vuln-lab', color: '#722ed1', permission: 'vulnerability:read' },
    { label: t('sidebar.terminalAgent'), description: t('dashboard.aiChatCommands'), icon: <ApiOutlined />, to: '/terminal', color: '#13c2c2', permission: 'agent:execute' },
  ].filter(action => canAccessPath({
    role: userPermissions?.role,
    permissions: userPermissions?.permissions,
    frontendPages: userPermissions?.frontend_pages,
  }, action.to, action.permission)), [t, userPermissions])

  return (
    <PageContainer
      title={t('dashboard.title')}
      subTitle={t('dashboard.subtitle')}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh}>
          {t('common.refresh')}
        </Button>,
        <Link key="new-scan" to="/scan/new">
          <Button type="primary" icon={<PlusOutlined />}>{t('dashboard.newScan')}</Button>
        </Link>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {connectionLost && (
          <Alert
            showIcon
            type="warning"
            message={t('dashboard.connectionIssues')}
          />
        )}

        <ProCard gutter={16} wrap>
          {quickActions.map(action => (
            <ProCard key={action.to} colSpan={{ xs: 24, sm: 12, md: 6 }} hoverable bordered>
              <Link to={action.to}>
                <Space direction="vertical" size={8}>
                  <span style={{ color: action.color, fontSize: 26 }}>{action.icon}</span>
                  <Title level={5} style={{ margin: 0 }}>{action.label}</Title>
                  <Text type="secondary">{action.description}</Text>
                </Space>
              </Link>
            </ProCard>
          ))}
        </ProCard>

        <StatisticCard.Group direction="row">
          <StatisticCard
            statistic={{ title: t('dashboard.totalScans'), value: stats?.scans.total || 0, icon: <DashboardOutlined /> }}
          />
          <StatisticCard
            statistic={{ title: t('dashboard.runningShort'), value: stats?.scans.running || 0, icon: <PlayCircleOutlined />, status: 'processing' }}
          />
          <StatisticCard
            statistic={{ title: t('dashboard.completedShort'), value: stats?.scans.completed || 0, icon: <CheckCircleOutlined />, status: 'success' }}
          />
          <StatisticCard
            statistic={{ title: t('dashboard.totalVulnsShort'), value: stats?.vulnerabilities.total || 0, icon: <BugOutlined /> }}
          />
          <StatisticCard
            statistic={{ title: t('dashboard.criticalShort'), value: stats?.vulnerabilities.critical || 0, icon: <AlertOutlined />, status: 'error' }}
          />
          <StatisticCard
            statistic={{ title: t('dashboard.highShort'), value: stats?.vulnerabilities.high || 0, icon: <SafetyCertificateOutlined />, status: 'warning' }}
          />
        </StatisticCard.Group>

        {activeAgents.length > 0 && (
          <ProCard
            title={(
              <Space>
                <Badge status="processing" />
                {t('dashboard.liveAgents')} ({activeAgents.length}/{maxConcurrent})
              </Space>
            )}
            extra={<Link to="/auto">{t('dashboard.manage')} <RightOutlined /></Link>}
            bordered
          >
            {activeAgents.map(agent => <ActiveAgentItem key={agent.agent_id} agent={agent} />)}
          </ProCard>
        )}

        <ProCard gutter={16} wrap>
          <ProCard colSpan={{ xs: 24, lg: 12 }} bodyStyle={{ padding: 0 }}>
            <DistributionCard title={t('dashboard.vulnerabilitySeverity')} data={severityData} />
          </ProCard>
          <ProCard colSpan={{ xs: 24, lg: 12 }} bodyStyle={{ padding: 0 }}>
            <DistributionCard title={t('dashboard.scanStatus')} data={scanStatusData} />
          </ProCard>
        </ProCard>

        <ProCard gutter={16} wrap>
          <ProCard
            colSpan={{ xs: 24, lg: 12 }}
            title={t('dashboard.recentScans')}
            extra={<Link to="/reports">{t('common.view')} <RightOutlined /></Link>}
            bordered
          >
            {recentScans.length === 0 ? (
              <Empty
                image={<GlobalOutlined style={{ fontSize: 48 }} />}
                description={(
                  <Space direction="vertical">
                    <Text type="secondary">{t('dashboard.noScansYet')}</Text>
                    <Link to="/scan/new">{t('dashboard.startFirstScan')}</Link>
                  </Space>
                )}
              />
            ) : (
              <List
                dataSource={recentScans}
                renderItem={scan => (
                  <List.Item
                    actions={[
                      <Tag key="status" color={statusColors[scan.status] === 'default' ? undefined : statusColors[scan.status]}>
                        {statusLabel(scan.status, t)}
                      </Tag>,
                      scan.total_vulnerabilities > 0 ? <Tag key="vulns" color="red">{scan.total_vulnerabilities} {t('dashboard.vulns')}</Tag> : null,
                    ]}
                  >
                    <List.Item.Meta
                      title={<Link to={`/scan/${scan.id}`}>{scan.name || t('dashboard.unnamedScan')}</Link>}
                      description={(
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Text type="secondary">{relativeTime(scan.created_at, t)}</Text>
                          {scan.status === 'running' && <Progress percent={scan.progress} size="small" status="active" />}
                        </Space>
                      )}
                    />
                  </List.Item>
                )}
              />
            )}
          </ProCard>

          <ProCard
            colSpan={{ xs: 24, lg: 12 }}
            title={t('dashboard.recentFindings')}
            extra={<Link to="/reports">{t('common.view')} <RightOutlined /></Link>}
            bordered
          >
            {recentVulnerabilities.length === 0 ? (
              <Empty image={<SafetyCertificateOutlined style={{ fontSize: 48 }} />} description={t('dashboard.noVulnsFound')} />
            ) : (
              <List
                dataSource={recentVulnerabilities.slice(0, 5)}
                renderItem={vuln => (
                  <List.Item
                    actions={[
                      vuln.confidence_score != null ? <Tag key="confidence" color={vuln.confidence_score >= 90 ? 'green' : vuln.confidence_score >= 60 ? 'gold' : 'red'}>{vuln.confidence_score}</Tag> : null,
                      vuln.validation_status === 'ai_rejected' ? <Tag key="rejected" color="orange">{t('dashboard.rejected')}</Tag> : null,
                      vuln.validation_status === 'validated' ? <Tag key="validated" color="green">{t('dashboard.validated')}</Tag> : null,
                      vuln.validation_status === 'false_positive' ? <Tag key="false-positive">{t('dashboard.falsePositiveShort')}</Tag> : null,
                      <Tag key="severity" color={severityColors[vuln.severity]}>{severityLabel(vuln.severity, t)}</Tag>,
                    ]}
                  >
                    <List.Item.Meta
                      title={<Text ellipsis>{vuln.title}</Text>}
                      description={<Text type="secondary" ellipsis>{vuln.affected_endpoint}</Text>}
                    />
                  </List.Item>
                )}
              />
            )}
          </ProCard>
        </ProCard>

        <ProCard
          title={t('dashboard.activityFeed')}
          extra={(
            <Segmented<ActivityFilter>
              value={activityFilter}
              onChange={value => setActivityFilter(value)}
              options={[
                { label: t('dashboard.all'), value: 'all' },
                { label: t('dashboard.scansShort'), value: 'scan' },
                { label: t('dashboard.vulnsShort'), value: 'vulnerability' },
                { label: t('dashboard.tasks'), value: 'agent_task' },
                { label: t('dashboard.reportsShort'), value: 'report' },
              ]}
            />
          )}
          bordered
        >
          {filteredActivity.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.noRecentActivity')} />
          ) : (
            <List
              dataSource={filteredActivity}
              renderItem={(activity, index) => (
                <List.Item
                  key={`${activity.type}-${activity.timestamp}-${index}`}
                  actions={[
                    activity.severity ? <Tag key="severity" color={severityColors[activity.severity]}>{severityLabel(activity.severity, t)}</Tag> : null,
                    activity.status && !activity.severity ? <Tag key="status" color={statusColors[activity.status] === 'default' ? undefined : statusColors[activity.status]}>{statusLabel(activity.status, t)}</Tag> : null,
                    <Text key="time" type="secondary">{relativeTime(activity.timestamp, t)}</Text>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Badge color={activity.type === 'vulnerability' ? 'red' : activity.type === 'agent_task' ? 'purple' : activity.type === 'report' ? 'green' : 'blue'} text={<ActivityIcon type={activity.type} />} />}
                    title={<Link to={activity.link}>{activity.title}</Link>}
                    description={(
                      <Space direction="vertical" size={2}>
                        <Space>
                          <Tag>{activity.type === 'agent_task' ? t('dashboard.tasks') : activity.type === 'vulnerability' ? t('dashboard.vulnsShort') : activity.type === 'scan' ? t('dashboard.scansShort') : t('dashboard.reportsShort')}</Tag>
                          <Text type="secondary">{activity.action}</Text>
                        </Space>
                        {activity.description && <Text type="secondary" ellipsis>{activity.description}</Text>}
                      </Space>
                    )}
                  />
                </List.Item>
              )}
            />
          )}
        </ProCard>
      </Space>
    </PageContainer>
  )
}
