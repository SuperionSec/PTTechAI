import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer } from '@ant-design/pro-components'
import { Button, Card, Col, Descriptions, Row, Statistic, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DatabaseOutlined, DockerOutlined, HeartOutlined, ReloadOutlined } from '@ant-design/icons'
import { monitorApi } from '../../services/system'
import type { MonitorDatabase, MonitorDocker, MonitorDockerContainer, MonitorHealth } from '../../services/system'

export default function SystemMonitorPage() {
  const { t } = useTranslation()
  const [health, setHealth] = useState<MonitorHealth | null>(null)
  const [database, setDatabase] = useState<MonitorDatabase | null>(null)
  const [docker, setDocker] = useState<MonitorDocker | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const [healthData, databaseData, dockerData] = await Promise.all([
        monitorApi.health(),
        monitorApi.database(),
        monitorApi.docker(),
      ])
      setHealth(healthData)
      setDatabase(databaseData)
      setDocker(dockerData)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to fetch monitor status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const containerColumns: ColumnsType<MonitorDockerContainer> = [
    { title: t('monitor.containerName', 'Name'), dataIndex: 'name', key: 'name' },
    { title: t('monitor.containerImage', 'Image'), dataIndex: 'image', key: 'image' },
    {
      title: t('monitor.containerStatus', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag color={status === 'running' ? 'green' : 'default'}>{status}</Tag>,
    },
  ]

  return (
    <PageContainer
      title={t('monitor.title', 'System Monitor')}
      subTitle={t('monitor.subtitle', 'Application, database, and Docker runtime status')}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined />} loading={loading} onClick={fetchStatus}>
          {t('common.refresh', 'Refresh')}
        </Button>,
      ]}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic
              title={t('monitor.appStatus', 'Application Status')}
              value={health?.status || '-'}
              prefix={<HeartOutlined />}
              valueStyle={{ color: health?.status === 'healthy' ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic
              title={t('monitor.databaseStatus', 'Database Status')}
              value={database?.status || '-'}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: database?.status === 'healthy' ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic
              title={t('monitor.dockerStatus', 'Docker Status')}
              value={docker?.status || '-'}
              prefix={<DockerOutlined />}
              valueStyle={{ color: docker?.status === 'healthy' ? '#3f8600' : '#cf1322' }}
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

      <Card title={t('monitor.dockerContainers', 'Docker Containers')} style={{ marginTop: 16 }} loading={loading}>
        {docker?.error ? (
          <Tag color="red">{docker.error}</Tag>
        ) : (
          <Table
            rowKey="name"
            columns={containerColumns}
            dataSource={docker?.containers || []}
            pagination={false}
            size="small"
          />
        )}
      </Card>
    </PageContainer>
  )
}
