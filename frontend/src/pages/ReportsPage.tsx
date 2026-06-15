import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  Flex,
  Input,
  Popconfirm,
  Segmented,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import type { ProColumns } from '@ant-design/pro-components'
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { relativeTime } from '../utils/time'
import { reportsApi, scansApi } from '../services/api'
import type { Report, Scan } from '../types'

const { Text } = Typography

type FormatFilter = 'all' | 'html' | 'json' | 'pdf'
type SortBy = 'date' | 'name' | 'vulns'
type SortDir = 'asc' | 'desc'

const formatColors: Record<string, string> = {
  html: 'blue',
  json: 'green',
  pdf: 'red',
}

const FORMAT_CHART_COLORS: Record<string, string> = {
  html: '#3b82f6',
  json: '#22c55e',
  pdf: '#ef4444',
}

function FormatChart({ reports }: { reports: Report[] }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {}
    reports.forEach(r => { counts[r.format] = (counts[r.format] || 0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({
      name: name.toUpperCase(),
      value,
      color: FORMAT_CHART_COLORS[name] || '#6b7280',
    }))
  }, [reports])

  if (data.length === 0) return null

  return (
    <Flex align="center" gap={16} style={{ padding: '8px 0' }}>
      <ResponsiveContainer width={80} height={80}>
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={20} outerRadius={35} paddingAngle={2} strokeWidth={0}>
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

export default function ReportsPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const [reports, setReports] = useState<Report[]>([])
  const [scans, setScans] = useState<Map<string, Scan>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [connectionLost, setConnectionLost] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const consecutiveErrorsRef = useRef(0)

  const notify = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    notification[type]({ message })
  }, [notification])

  const fetchData = useCallback(async () => {
    try {
      const [reportsData, scansData] = await Promise.all([
        reportsApi.list(),
        scansApi.list(1, 100),
      ])
      setReports(reportsData.reports)
      const scansMap = new Map<string, Scan>()
      scansData.scans.forEach((scan: Scan) => scansMap.set(scan.id, scan))
      setScans(scansMap)

      if (consecutiveErrorsRef.current >= 3) {
        setConnectionLost(false)
        notify(t('reports.connectionRestored'), 'success')
      }
      consecutiveErrorsRef.current = 0
    } catch (error) {
      console.error('Failed to fetch reports:', error)
      consecutiveErrorsRef.current++
      if (consecutiveErrorsRef.current >= 3) setConnectionLost(true)
    }
  }, [notify, t])

  useEffect(() => {
    setIsLoading(true)
    fetchData().finally(() => setIsLoading(false))
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
    notify(t('reports.reportsRefreshed'), 'info')
  }, [fetchData, notify, t])

  const handleDelete = useCallback(async (report: Report) => {
    try {
      await reportsApi.delete(report.id)
      setReports(prev => prev.filter(item => item.id !== report.id))
      notify(t('reports.deleted', 'Report deleted'), 'success')
    } catch (error) {
      console.error('Failed to delete report:', error)
      notify(t('reports.failedToDeleteReport'), 'error')
    }
  }, [notify, t])

  const handleDownload = useCallback((reportId: string, format: string) => {
    window.open(reportsApi.getDownloadUrl(reportId, format), '_blank')
    notify(`Downloading ${format.toUpperCase()} report`, 'info')
  }, [notify])

  const handleDownloadZip = useCallback((reportId: string) => {
    window.open(reportsApi.getDownloadZipUrl(reportId), '_blank')
    notify(t('reports.downloadingZip'), 'info')
  }, [notify, t])

  const handleAiRegenerate = useCallback(async (scanId: string, reportTitle: string) => {
    setRegeneratingId(scanId)
    try {
      const report = await reportsApi.generateAiReport({
        scan_id: scanId,
        title: `AI Report - ${reportTitle}`,
      })
      window.open(reportsApi.getViewUrl(report.id), '_blank')
      const reportsData = await reportsApi.list()
      setReports(reportsData.reports)
      notify(t('reports.aiReportGenerated'), 'success')
    } catch (error) {
      console.error('Failed to generate AI report:', error)
      notify(t('reports.failedToGenerateAiReport'), 'error')
    } finally {
      setRegeneratingId(null)
    }
  }, [notify, t])

  const filteredReports = useMemo(() => {
    let result = [...reports]

    if (formatFilter !== 'all') {
      result = result.filter(report => report.format === formatFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(report => {
        const scan = scans.get(report.scan_id)
        const title = (report.title || scan?.name || '').toLowerCase()
        return title.includes(q) || report.format.includes(q)
      })
    }

    result.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'date') {
        cmp = new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime()
      } else if (sortBy === 'name') {
        const aName = (a.title || scans.get(a.scan_id)?.name || '').toLowerCase()
        const bName = (b.title || scans.get(b.scan_id)?.name || '').toLowerCase()
        cmp = aName.localeCompare(bName)
      } else {
        cmp = (scans.get(a.scan_id)?.total_vulnerabilities || 0) - (scans.get(b.scan_id)?.total_vulnerabilities || 0)
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return result
  }, [reports, formatFilter, searchQuery, sortBy, sortDir, scans])

  const statsData = useMemo(() => {
    const totalVulns = reports.reduce((sum, report) => sum + (scans.get(report.scan_id)?.total_vulnerabilities || 0), 0)
    const formats: Record<string, number> = {}
    reports.forEach(report => { formats[report.format] = (formats[report.format] || 0) + 1 })
    const autoCount = reports.filter(report => report.auto_generated).length
    return { totalVulns, formats, autoCount }
  }, [reports, scans])

  const columns: ProColumns<Report>[] = [
    {
      title: t('common.name'),
      dataIndex: 'title',
      render: (_, report) => {
        const scan = scans.get(report.scan_id)
        const title = report.title || scan?.name || t('reports.securityReport')
        return (
          <Space direction="vertical" size={2}>
            <Space wrap>
              <Link to={`/reports/${report.id}`}>{title}</Link>
              <Tag color={formatColors[report.format]}>{report.format.toUpperCase()}</Tag>
              {report.auto_generated && <Tag color="gold" icon={<RobotOutlined />}>{t('dashboard.auto')}</Tag>}
              {report.is_partial && <Tag color="orange">{t('dashboard.partial')}</Tag>}
            </Space>
            <Space wrap size={6}>
              <Text type="secondary">{relativeTime(report.generated_at, t)}</Text>
              {scan && <Link to={`/scan/${scan.id}`}>{t('reports.viewScan')}</Link>}
            </Space>
          </Space>
        )
      },
    },
    {
      title: t('dashboard.vulns'),
      width: 190,
      render: (_, report) => {
        const scan = scans.get(report.scan_id)
        if (!scan || scan.total_vulnerabilities === 0) return <Text type="secondary">0</Text>
        return (
          <Space wrap size={4}>
            {scan.critical_count > 0 && <Tag color="red">{scan.critical_count}C</Tag>}
            {scan.high_count > 0 && <Tag color="orange">{scan.high_count}H</Tag>}
            {scan.medium_count > 0 && <Tag color="gold">{scan.medium_count}M</Tag>}
            {scan.low_count > 0 && <Tag color="blue">{scan.low_count}L</Tag>}
          </Space>
        )
      },
    },
    {
      title: t('common.actions', 'Actions'),
      valueType: 'option',
      width: 260,
      render: (_, report) => {
        const scan = scans.get(report.scan_id)
        const title = report.title || scan?.name || t('reports.securityReport')
        return [
          <Tooltip key="view" title={t('reports.viewInBrowser')}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => window.open(reportsApi.getViewUrl(report.id), '_blank')} />
          </Tooltip>,
          <Tooltip key="html" title={t('reports.downloadHtml')}>
            <Button size="small" icon={<CloudDownloadOutlined />} onClick={() => handleDownload(report.id, 'html')}>HTML</Button>
          </Tooltip>,
          <Tooltip key="json" title={t('reports.downloadJson')}>
            <Button size="small" onClick={() => handleDownload(report.id, 'json')}>JSON</Button>
          </Tooltip>,
          <Tooltip key="zip" title={t('reports.downloadZip')}>
            <Button size="small" onClick={() => handleDownloadZip(report.id)}>ZIP</Button>
          </Tooltip>,
          <Tooltip key="ai" title={t('reports.generateAiReport')}>
            <Button size="small" icon={<RobotOutlined />} loading={regeneratingId === report.scan_id} onClick={() => handleAiRegenerate(report.scan_id, title)} />
          </Tooltip>,
          <Popconfirm
            key="delete"
            title={t('reports.deleteReport')}
            description={t('reports.deleteConfirm', { title })}
            okText={t('common.delete')}
            cancelText={t('common.cancel')}
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(report)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>,
        ]
      },
    },
  ]

  if (isLoading) {
    return (
      <PageContainer title={t('reports.title')} subTitle={t('reports.subtitle')}>
        <ProCard bordered>
          <Spin style={{ display: 'block', margin: '64px auto' }} />
        </ProCard>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={t('reports.title')}
      subTitle={t('reports.subtitle')}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh}>{t('common.refresh')}</Button>,
        <Link key="scan" to="/scan/new">
          <Button type="primary" icon={<PlusOutlined />}>{t('dashboard.newScan')}</Button>
        </Link>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {connectionLost && <Alert type="warning" showIcon message={t('dashboard.connectionIssues')} />}

        {reports.length > 0 && (
          <StatisticCard.Group direction="row">
            <StatisticCard statistic={{ title: t('reports.totalReports'), value: reports.length, icon: <FileTextOutlined /> }} />
            <StatisticCard statistic={{ title: t('reports.totalVulns'), value: statsData.totalVulns, icon: <WarningOutlined />, status: 'error' }} />
            <StatisticCard statistic={{ title: t('reports.aiGenerated'), value: statsData.autoCount, icon: <RobotOutlined />, status: 'processing' }} />
            <StatisticCard
              statistic={{
                title: t('reports.formatDistribution', 'Formats'),
                value: Object.entries(statsData.formats).map(([format, count]) => `${format.toUpperCase()} ${count}`).join(' / ') || '-',
              }}
            />
          </StatisticCard.Group>
        )}

        {reports.length > 0 && <FormatChart reports={reports} />}

        <ProCard bordered>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder={t('reports.searchReports')}
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                style={{ width: 280 }}
              />
              <Space wrap>
                <Segmented<FormatFilter>
                  value={formatFilter}
                  onChange={value => setFormatFilter(value)}
                  options={[
                    { label: t('common.all'), value: 'all' },
                    { label: 'HTML', value: 'html' },
                    { label: 'JSON', value: 'json' },
                    { label: 'PDF', value: 'pdf' },
                  ]}
                />
                <Segmented<SortBy>
                  value={sortBy}
                  onChange={value => setSortBy(value)}
                  options={[
                    { label: t('common.date'), value: 'date' },
                    { label: t('common.name'), value: 'name' },
                    { label: t('dashboard.vulns'), value: 'vulns' },
                  ]}
                />
                <Segmented<SortDir>
                  value={sortDir}
                  onChange={value => setSortDir(value)}
                  options={[
                    { label: '↓', value: 'desc' },
                    { label: '↑', value: 'asc' },
                  ]}
                />
              </Space>
            </Space>

            {reports.length === 0 ? (
              <Empty
                image={<FileTextOutlined style={{ fontSize: 56 }} />}
                description={(
                  <Space direction="vertical">
                    <Text>{t('reports.noReports')}</Text>
                    <Text type="secondary">{t('reports.generatedAfterScan')}</Text>
                    <Link to="/scan/new"><Button type="primary">{t('reports.startNewScan')}</Button></Link>
                  </Space>
                )}
              />
            ) : filteredReports.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('reports.noMatchFilters')}
              >
                <Button onClick={() => { setSearchQuery(''); setFormatFilter('all') }}>{t('common.clearFilters')}</Button>
              </Empty>
            ) : (
              <ProTable<Report>
                rowKey="id"
                search={false}
                options={false}
                dataSource={filteredReports}
                columns={columns}
                pagination={{ pageSize: 10, showSizeChanger: true }}
                toolBarRender={false}
              />
            )}
          </Space>
        </ProCard>
      </Space>
    </PageContainer>
  )
}
