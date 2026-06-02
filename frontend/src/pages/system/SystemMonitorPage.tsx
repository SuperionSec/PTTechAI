import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer } from '@ant-design/pro-components'
import { Button, Card, Col, Descriptions, Row, Statistic, message } from 'antd'
import { DatabaseOutlined, HeartOutlined, ReloadOutlined } from '@ant-design/icons'
import { monitorApi } from '../../services/system'
import type { MonitorDatabase, MonitorHealth } from '../../services/system'

export default function SystemMonitorPage() {
  const { t } = useTranslation()
  const [health, setHealth] = useState<MonitorHealth | null>(null)
  const [database, setDatabase] = useState<MonitorDatabase | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const [healthData, databaseData] = await Promise.all([
        monitorApi.health(),
        monitorApi.database(),
      ])
      setHealth(healthData)
      setDatabase(databaseData)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to fetch monitor status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  return (
    <PageContainer
      title={t('monitor.title', 'System Monitor')}
      subTitle={t('monitor.subtitle', 'Application and database runtime status')}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined />} loading={loading} onClick={fetchStatus}>
          {t('common.refresh', 'Refresh')}
        </Button>,
      ]}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card loading={loading}>
            <Statistic
              title={t('monitor.appStatus', 'Application Status')}
              value={health?.status || '-'}
              prefix={<HeartOutlined />}
              valueStyle={{ color: health?.status === 'healthy' ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card loading={loading}>
            <Statistic
              title={t('monitor.databaseStatus', 'Database Status')}
              value={database?.status || '-'}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: database?.status === 'healthy' ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title={t('monitor.appDetails', 'Application Details')} style={{ marginTop: 16 }} loading={loading}>
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label={t('monitor.appName', 'App')}>{health?.app || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('monitor.version', 'Version')}>{health?.version || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('monitor.debug', 'Debug')}>{String(health?.debug ?? '-')}</Descriptions.Item>
          <Descriptions.Item label={t('monitor.python', 'Python')}>{health?.python || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('monitor.platform', 'Platform')}>{health?.platform || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('monitor.checkedAt', 'Checked At')}>{health?.timestamp || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
    </PageContainer>
  )
}
