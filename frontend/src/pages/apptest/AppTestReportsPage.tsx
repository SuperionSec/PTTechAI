import { useEffect, useState } from 'react'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import {
  Button, Space, Table, Tag, message, Select, Empty,
} from 'antd'
import {
  ArrowLeftOutlined, ReloadOutlined, DownloadOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { apptestApi } from '../../services/api'
import type { AppTestTaskSummary } from '../../types'
import { getTerminalTypeColor, getTerminalTypeLabel } from '../../types/apptest'

export default function AppTestReportsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<AppTestTaskSummary[]>([])
  const [reportType, setReportType] = useState<number>(1)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const resp = await apptestApi.listTasks({ status: 'completed', per_page: 100 })
      setTasks(resp.data.tasks || [])
    } catch (err: any) {
      message.error(err.response?.data?.detail || t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleDownload = async (taskId: string, taskName: string) => {
    setDownloadingId(taskId)
    try {
      const resp = await apptestApi.getReport(taskId, reportType)
      const ext = reportType === 1 ? '.docx' : '.pdf'
      const filename = `${taskName}_report${ext}`
      const blob = new Blob([resp.data])
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      message.success(t('apptest.reportDownloaded'))
    } catch (err: any) {
      message.error(err.response?.data?.detail || t('apptest.reportDownloadFailed'))
    } finally {
      setDownloadingId(null)
    }
  }

  const columns = [
    {
      title: t('apptest.appName'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: AppTestTaskSummary) => (
        <Space>
          <span>{text}</span>
          {record.version && <Tag>{record.version}</Tag>}
        </Space>
      ),
    },
    {
      title: t('apptest.terminalType'),
      dataIndex: 'terminal_type',
      key: 'terminal_type',
      width: 120,
      render: (v: number) => (
        <Tag color={getTerminalTypeColor(v)}>{getTerminalTypeLabel(v)}</Tag>
      ),
    },
    {
      title: t('apptest.score'),
      dataIndex: 'score',
      key: 'score',
      width: 100,
      render: (v?: number) => (
        v !== null && v !== undefined
          ? <Tag color={v >= 80 ? 'success' : v >= 60 ? 'warning' : 'error'}>{v}分</Tag>
          : '-'
      ),
    },
    {
      title: t('apptest.vulnerabilities'),
      key: 'vulns',
      width: 180,
      render: (_: unknown, record: AppTestTaskSummary) => (
        <Space>
          {record.vuln_high > 0 && <Tag color="error">高 {record.vuln_high}</Tag>}
          {record.vuln_mid > 0 && <Tag color="warning">中 {record.vuln_mid}</Tag>}
          {record.vuln_low > 0 && <Tag color="default">低 {record.vuln_low}</Tag>}
          {record.vuln_high + record.vuln_mid + record.vuln_low === 0 && '-'}
        </Space>
      ),
    },
    {
      title: t('apptest.completedAt'),
      dataIndex: 'completed_at',
      key: 'completed_at',
      width: 180,
      render: (v: string | null) => v || '-',
    },
    {
      title: t('common.operation'),
      key: 'action',
      width: 150,
      render: (_: unknown, record: AppTestTaskSummary) => (
        <Button
          type="primary"
          size="small"
          icon={<DownloadOutlined />}
          loading={downloadingId === record.id}
          onClick={() => handleDownload(record.id, record.name)}
        >
          {t('common.download')}
        </Button>
      ),
    },
  ]

  return (
    <PageContainer
      title={t('apptest.reportManagement')}
      extra={[
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => navigate('/apptest')}>
          {t('common.back')}
        </Button>,
        <Button key="refresh" icon={<ReloadOutlined />} onClick={load} loading={loading}>
          {t('common.refresh')}
        </Button>,
      ]}
    >
      <ProCard>
        <Space style={{ marginBottom: 16 }}>
          <Select
            value={reportType}
            onChange={setReportType}
            style={{ width: 140 }}
            options={[
              { value: 1, label: 'Word' },
              { value: 2, label: 'PDF' },
            ]}
          />
        </Space>

        {tasks.length === 0 ? (
          <Empty description={t('apptest.noCompletedTasks')} />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={tasks}
            loading={loading}
            pagination={{ pageSize: 20 }}
          />
        )}
      </ProCard>
    </PageContainer>
  )
}
