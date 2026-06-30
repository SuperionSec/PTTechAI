import { useEffect, useState } from 'react'
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components'
import { Row, Col, Select, Button, Table, Tag, Empty, message } from 'antd'
import { ReloadOutlined, AppstoreOutlined, BugOutlined, SafetyOutlined, FileSearchOutlined } from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import { apptestApi } from '../../services/api'
import type { AppTestStatistics, AppTestStatRiskItem } from '../../types/apptest'
import { TERMINAL_TYPE_OPTIONS } from '../../types/apptest'

const PIE_COLORS = ['#f5222d', '#fa8c16', '#faad14', '#a0d911', '#52c41a', '#13c2c2', '#1677ff', '#2f54eb', '#722ed1', '#eb2f96', '#8c8c8c', '#fadb14', '#eb2f96', '#13c2c2']

export default function AppTestStatisticsPage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<AppTestStatistics | null>(null)
  const [dimension, setDimension] = useState(3)
  const [terminalType, setTerminalType] = useState(1)

  const load = async () => {
    setLoading(true)
    try {
      const resp = await apptestApi.getStatistics({ dimension, terminal_type: terminalType })
      setStats(resp.data)
    } catch (err: any) {
      message.error(err.response?.data?.detail || t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [dimension, terminalType])

  // Build trend chart data: each date has buckets per scoreType
  const trendData = (() => {
    if (!stats?.trend?.date_list?.length) return []
    return stats.trend.date_list.map((date, i) => {
      const row: Record<string, string | number> = { date }
      stats.trend.score_type.forEach((type, ti) => {
        row[type] = stats.trend.score_list[ti]?.[i] ?? 0
      })
      return row
    })
  })()

  const pieData = (stats?.risk_types || [])
    .filter(r => r.count > 0)
    .map(r => ({ name: r.name, value: r.count }))

  const ov = stats?.overview

  const riskColumns = [
    {
      title: t('apptest.rank'),
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, idx: number) => <Tag color={idx < 3 ? 'red' : 'default'}>{idx + 1}</Tag>,
    },
    { title: t('apptest.vulnName'), dataIndex: 'name', key: 'name' },
    {
      title: t('apptest.vulnGrade'),
      dataIndex: 'grade',
      key: 'grade',
      width: 90,
      render: (v: string) => <Tag color={v.includes('高') ? 'error' : v.includes('中') ? 'warning' : 'default'}>{v || '-'}</Tag>,
    },
    {
      title: t('apptest.riskCount'),
      dataIndex: 'risk_num',
      key: 'risk_num',
      width: 100,
      render: (v: number) => <b>{v}</b>,
    },
  ]

  return (
    <PageContainer
      title={t('apptest.statistics')}
      subTitle={t('apptest.statisticsSubtitle')}
      extra={[
        <Select
          key="terminal"
          value={terminalType}
          onChange={setTerminalType}
          style={{ width: 130 }}
          options={TERMINAL_TYPE_OPTIONS
            .filter(o => [1, 2, 10].includes(o.value))
            .map(o => ({ value: o.value, label: o.label }))}
        />,
        <Select
          key="dim"
          value={dimension}
          onChange={setDimension}
          style={{ width: 110 }}
          options={[
            { value: 1, label: t('apptest.dimDay') },
            { value: 2, label: t('apptest.dimWeek') },
            { value: 3, label: t('apptest.dimMonth') },
          ]}
        />,
        <Button key="refresh" icon={<ReloadOutlined />} onClick={load} loading={loading}>{t('common.refresh')}</Button>,
      ]}
    >
      {/* Overview cards */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatisticCard loading={loading} statistic={{ title: t('apptest.statAppNum'), value: ov?.app_num ?? 0, icon: <AppstoreOutlined style={{ color: '#1677ff' }} /> }} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatisticCard loading={loading} statistic={{ title: t('apptest.statDetectionNum'), value: ov?.detection_num ?? 0, icon: <FileSearchOutlined style={{ color: '#13c2c2' }} /> }} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatisticCard loading={loading} statistic={{ title: t('apptest.statVersionNum'), value: ov?.version_num ?? 0, icon: <SafetyOutlined style={{ color: '#722ed1' }} /> }} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatisticCard loading={loading} statistic={{ title: t('apptest.statFlawNum'), value: ov?.flaw_num ?? 0, icon: <BugOutlined style={{ color: '#8c8c8c' }} /> }} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatisticCard loading={loading} statistic={{ title: t('apptest.statFlawHigh'), value: ov?.flaw_high_num ?? 0, valueStyle: { color: '#f5222d' } }} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatisticCard loading={loading} statistic={{ title: t('apptest.statFlawMid'), value: ov?.flaw_middle_num ?? 0, valueStyle: { color: '#faad14' } }} />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* Trend chart */}
        <Col xs={24} lg={14}>
          <ProCard title={t('apptest.scoreTrend')} loading={loading} style={{ minHeight: 360 }}>
            {trendData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={trendData}>
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {stats?.trend.score_type.map((type, i) => (
                    <Bar key={type} dataKey={type} stackId="a" fill={['#f5222d', '#faad14', '#52c41a'][i] || '#1677ff'} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty description={t('apptest.noData')} />}
          </ProCard>
        </Col>
        {/* Risk type pie */}
        <Col xs={24} lg={10}>
          <ProCard title={t('apptest.riskTypeDist')} loading={loading} style={{ minHeight: 360 }}>
            {pieData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: any) => e.name}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <Empty description={t('apptest.noData')} />}
          </ProCard>
        </Col>
      </Row>

      {/* Risk TOP10 */}
      <ProCard title={t('apptest.riskTop10')} style={{ marginTop: 16 }} loading={loading}>
        <Table<AppTestStatRiskItem>
          rowKey={(r) => r.name}
          columns={riskColumns}
          dataSource={stats?.risk_top10 || []}
          pagination={false}
          size="small"
          locale={{ emptyText: <Empty description={t('apptest.noData')} /> }}
        />
      </ProCard>
    </PageContainer>
  )
}
