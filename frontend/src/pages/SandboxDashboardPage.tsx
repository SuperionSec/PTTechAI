import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  Flex,
  Progress,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import {
  ApiOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  CodeSandboxOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  HeartOutlined,
  HddOutlined,
  ReloadOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { relativeTime } from '../utils/time'
import { sandboxApi } from '../services/api'
import type { SandboxPoolStatus, SandboxContainer } from '../types'

const { Text } = Typography

interface HealthResult {
  status: string
  tools: string[]
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}m ${s}s`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function utilizationColor(percent: number) {
  if (percent >= 100) return '#ff4d4f'
  if (percent >= 80) return '#faad14'
  return '#52c41a'
}

function healthAlertType(status: string): 'success' | 'warning' | 'error' | 'info' {
  if (status === 'healthy') return 'success'
  if (status === 'degraded') return 'warning'
  if (status === 'error') return 'error'
  return 'info'
}

const DONUT_COLORS = ['#3b82f6', '#d1d5db']

export default function SandboxDashboardPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const [data, setData] = useState<SandboxPoolStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [destroyConfirm, setDestroyConfirm] = useState<string | null>(null)
  const [healthResults, setHealthResults] = useState<Record<string, HealthResult | null>>({})
  const [healthLoading, setHealthLoading] = useState<Record<string, boolean>>({})
  const [actionLoading, setActionLoading] = useState(false)
  const [refreshSpinning, setRefreshSpinning] = useState(false)
  const [pollFailures, setPollFailures] = useState(0)
  const dataRef = useRef(data)
  dataRef.current = data

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const result = await sandboxApi.list()
      setData(result)
      setPollFailures(0)
    } catch (error) {
      console.error('Failed to fetch sandbox data:', error)
      setPollFailures(prev => prev + 1)
      if (!dataRef.current) {
        setData({
          pool: { active: 0, max_concurrent: 0, image: 'N/A', container_ttl_minutes: 0, docker_available: false },
          containers: [],
          error: t('sandbox.failedToConnectBackend'),
        })
      }
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchData(true)
    const interval = setInterval(() => fetchData(false), 15000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleRefreshClick = useCallback(() => {
    setRefreshSpinning(true)
    fetchData(false)
    setTimeout(() => setRefreshSpinning(false), 800)
  }, [fetchData])

  const handleDestroy = async (scanId: string) => {
    if (destroyConfirm !== scanId) {
      setDestroyConfirm(scanId)
      setTimeout(() => setDestroyConfirm(null), 5000)
      return
    }

    setDestroyConfirm(null)
    setActionLoading(true)
    try {
      await sandboxApi.destroy(scanId)
      notification.success({ message: `Container for scan ${scanId.slice(0, 8)}... destroyed` })
      await fetchData(false)
    } catch (error: any) {
      notification.error({ message: error?.response?.data?.detail || t('sandbox.failedToDestroyContainer') })
    } finally {
      setActionLoading(false)
    }
  }

  const handleHealthCheck = async (scanId: string) => {
    setHealthLoading(prev => ({ ...prev, [scanId]: true }))
    try {
      const result = await sandboxApi.healthCheck(scanId)
      setHealthResults(prev => ({ ...prev, [scanId]: result }))
      setTimeout(() => {
        setHealthResults(prev => ({ ...prev, [scanId]: null }))
      }, 8000)
    } catch {
      setHealthResults(prev => ({ ...prev, [scanId]: { status: 'error', tools: [] } }))
    } finally {
      setHealthLoading(prev => ({ ...prev, [scanId]: false }))
    }
  }

  const handleCleanup = async (type: 'expired' | 'orphans') => {
    setActionLoading(true)
    try {
      if (type === 'expired') {
        await sandboxApi.cleanup()
      } else {
        await sandboxApi.cleanupOrphans()
      }
      notification.success({ message: type === 'expired' ? t('sandbox.expiredContainersCleaned') : t('sandbox.orphanContainersCleaned') })
      await fetchData(false)
    } catch (error: any) {
      notification.error({ message: error?.response?.data?.detail || t('sandbox.cleanupFailed') })
    } finally {
      setActionLoading(false)
    }
  }

  const pool = data?.pool
  const containers = data?.containers || []
  const utilizationPct = pool ? (pool.max_concurrent > 0 ? (pool.active / pool.max_concurrent) * 100 : 0) : 0
  const connectionLost = pollFailures >= 3
  const imageName = pool?.image?.split(':')[0]?.split('/').pop() || 'N/A'
  const imageTag = pool?.image?.includes(':') ? pool.image.split(':')[1] : 'latest'

  const donutData = useMemo(() => {
    if (!pool || pool.max_concurrent === 0) return []
    return [
      { name: 'Active', value: pool.active },
      { name: 'Available', value: Math.max(0, pool.max_concurrent - pool.active) },
    ]
  }, [pool])

  const containerColumns: ProColumns<SandboxContainer>[] = useMemo(() => [
    {
      title: t('sandbox.runningContainers'),
      dataIndex: 'container_name',
      render: (_, container) => {
        const health = healthResults[container.scan_id]
        return (
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Space wrap>
              <Text strong code>{container.container_name}</Text>
              <Tag color={container.available ? 'green' : 'red'} icon={container.available ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}>
                {container.available ? t('sandbox.running') : t('sandbox.stopped')}
              </Tag>
            </Space>
            <Space wrap size="small">
              <Text type="secondary">{t('sandbox.scan')}:</Text>
              <Link to={`/scan/${container.scan_id}`}><Text code>{container.scan_id.slice(0, 12)}...</Text></Link>
            </Space>
            {health && (
              <Alert
                type={healthAlertType(health.status)}
                showIcon
                message={
                  <Space wrap>
                    <Text>{t('sandbox.health')}: {health.status}</Text>
                    {health.tools.length > 0 && <Text type="secondary">Verified: {health.tools.join(', ')}</Text>}
                  </Space>
                }
              />
            )}
          </Space>
        )
      },
    },
    {
      title: t('sandbox.uptime'),
      dataIndex: 'uptime_seconds',
      width: 130,
      render: (_, container) => <Text>{formatUptime(container.uptime_seconds)}</Text>,
    },
    {
      title: t('sandbox.created'),
      dataIndex: 'created_at',
      width: 170,
      render: (_, container) => <Text title={container.created_at || undefined}>{relativeTime(container.created_at, t)}</Text>,
    },
    {
      title: t('sandbox.tools'),
      dataIndex: 'installed_tools',
      render: (_, container) => container.installed_tools.length > 0 ? (
        <Space size={[0, 4]} wrap>
          {container.installed_tools.map(tool => <Tag key={tool} icon={<ToolOutlined />}>{tool}</Tag>)}
        </Space>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 230,
      render: (_, container) => {
        const isConfirming = destroyConfirm === container.scan_id
        return [
          <Button
            key="health"
            size="small"
            icon={<HeartOutlined />}
            loading={healthLoading[container.scan_id]}
            onClick={() => handleHealthCheck(container.scan_id)}
          >
            {t('sandbox.healthCheck')}
          </Button>,
          <Button
            key="destroy"
            size="small"
            danger
            type={isConfirming ? 'primary' : 'default'}
            icon={<DeleteOutlined />}
            loading={actionLoading}
            onClick={() => handleDestroy(container.scan_id)}
          >
            {isConfirming ? t('sandbox.confirmDestroy') : t('sandbox.destroy')}
          </Button>,
        ]
      },
    },
  ], [actionLoading, destroyConfirm, healthLoading, healthResults, t])

  if (loading && !data) {
    return (
      <PageContainer title={t('sandbox.title')} subTitle={t('sandbox.subtitle')}>
        <ProCard bordered><Spin style={{ display: 'block', margin: '64px auto' }} /></ProCard>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={t('sandbox.title')}
      subTitle={t('sandbox.subtitle')}
      extra={[
        <Button key="cleanup-expired" icon={<ClockCircleOutlined />} loading={actionLoading} onClick={() => handleCleanup('expired')}>
          {t('sandbox.cleanupExpired')}
        </Button>,
        <Button key="cleanup-orphans" danger icon={<DeleteOutlined />} loading={actionLoading} onClick={() => handleCleanup('orphans')}>
          {t('sandbox.cleanupOrphans')}
        </Button>,
        <Button key="refresh" icon={<ReloadOutlined spin={refreshSpinning} />} onClick={handleRefreshClick}>
          {t('common.refresh')}
        </Button>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {connectionLost && (
          <Alert type="warning" showIcon icon={<WarningOutlined />} message={`Connection lost -- ${t('sandbox.dataStaleRetrying')}`} />
        )}

        {data?.error && <Alert type="error" showIcon message={data.error} />}

        <StatisticCard.Group direction="row">
          <StatisticCard
            statistic={{
              title: t('sandbox.activeContainers'),
              value: `${pool?.active || 0}/${pool?.max_concurrent || 0}`,
              icon: <CloudServerOutlined />,
              valueStyle: { color: utilizationColor(utilizationPct) },
            }}
          />
          <StatisticCard
            statistic={{
              title: t('sandbox.dockerEngine'),
              value: pool?.docker_available ? t('sandbox.online') : t('sandbox.offline'),
              icon: <HddOutlined />,
              valueStyle: { color: pool?.docker_available ? '#52c41a' : '#ff4d4f' },
            }}
          />
          <StatisticCard
            statistic={{
              title: imageName,
              value: imageTag,
              icon: <CodeSandboxOutlined />,
            }}
          />
          <StatisticCard
            statistic={{
              title: t('sandbox.containerTTL'),
              value: pool?.container_ttl_minutes || 0,
              suffix: 'min',
              icon: <ClockCircleOutlined />,
            }}
          />
        </StatisticCard.Group>

        {donutData.length > 0 && (
          <ProCard bordered>
            <Flex align="center" gap={16}>
              <ResponsiveContainer width={96} height={96}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={25} outerRadius={38} paddingAngle={2} dataKey="value" strokeWidth={0}>
                    {donutData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} itemStyle={{ color: '#e2e8f0' }} />
                </PieChart>
              </ResponsiveContainer>
              <Space direction="vertical" size={4}>
                {donutData.map((d, i) => (
                  <Flex key={d.name} align="center" gap={8}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: DONUT_COLORS[i], flexShrink: 0 }} />
                    <Text style={{ fontSize: 12 }}>{d.name}</Text>
                    <Text strong style={{ fontSize: 12, marginLeft: 'auto' }}>{d.value}</Text>
                  </Flex>
                ))}
              </Space>
            </Flex>
          </ProCard>
        )}

        {pool && pool.max_concurrent > 0 && (
          <ProCard bordered title={t('sandbox.poolCapacity')} extra={<Text strong style={{ color: utilizationColor(utilizationPct) }}>{Math.round(utilizationPct)}%</Text>}>
            <Progress percent={Math.round(utilizationPct)} strokeColor={utilizationColor(utilizationPct)} status={utilizationPct >= 100 ? 'exception' : 'active'} />
          </ProCard>
        )}

        <ProCard bordered title={`${t('sandbox.runningContainers')} (${containers.length})`} extra={<Space><ApiOutlined /><Text type="secondary">{t('sandbox.autoRefresh')}</Text></Space>}>
          {containers.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={
              <Space direction="vertical" size={2}>
                <Text>{t('sandbox.noContainersRunning')}</Text>
                <Text type="secondary">{t('sandbox.noContainersDesc')}</Text>
              </Space>
            } />
          ) : (
            <ProTable<SandboxContainer>
              rowKey="scan_id"
              search={false}
              options={false}
              columns={containerColumns}
              dataSource={containers}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              toolBarRender={false}
            />
          )}
        </ProCard>
      </Space>
    </PageContainer>
  )
}
