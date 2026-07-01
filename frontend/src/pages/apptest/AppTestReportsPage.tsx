import { useEffect, useState, useMemo } from 'react'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import {
  Button, Space, Table, Tag, message, Empty, Input, Select,
} from 'antd'
import {
  ArrowLeftOutlined, ReloadOutlined, FileWordOutlined, FilePdfOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { apptestApi } from '../../services/api'
import type { AppTestTaskSummary } from '../../types'
import {
  getTerminalTypeColor, getTerminalTypeLabel, getScoreColor,
  formatDateTime, TERMINAL_TYPE_OPTIONS,
} from '../../types/apptest'

const { Search } = Input

export default function AppTestReportsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<AppTestTaskSummary[]>([])
  const [downloading, setDownloading] = useState<string | null>(null)  // `${id}-${type}`
  const [searchKeyword, setSearchKeyword] = useState('')
  const [terminalFilter, setTerminalFilter] = useState<number | undefined>(undefined)

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

  useEffect(() => { load() }, [])

  const handleDownload = async (taskId: string, taskName: string, reportType: number) => {
    setDownloading(`${taskId}-${reportType}`)
    try {
      const resp = await apptestApi.getReport(taskId, reportType)
      const blob = new Blob([resp.data])
      const ct: string = resp.headers?.['content-type'] || ''
      const ext = ct.includes('pdf') ? '.pdf' : ct.includes('word') ? '.docx' : (reportType === 1 ? '.docx' : '.pdf')
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${taskName}_report${ext}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      message.success(t('apptest.reportDownloaded'))
    } catch (err: any) {
      message.error(err.response?.data?.detail || t('apptest.reportDownloadFailed'))
    } finally {
      setDownloading(null)
    }
  }

  const displayTasks = useMemo(() => tasks.filter(tk => {
    if (terminalFilter && tk.terminal_type !== terminalFilter) return false
    if (searchKeyword && !tk.name.toLowerCase().includes(searchKeyword.toLowerCase())) return false
    return true
  }), [tasks, terminalFilter, searchKeyword])

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
      width: 110,
      render: (v: number) => <Tag color={getTerminalTypeColor(v)}>{getTerminalTypeLabel(v)}</Tag>,
    },
    {
      title: t('apptest.score'),
      dataIndex: 'score',
      key: 'score',
      width: 100,
      sorter: (a: AppTestTaskSummary, b: AppTestTaskSummary) => (a.score ?? -1) - (b.score ?? -1),
      render: (v?: number) => (v !== null && v !== undefined ? <Tag color={getScoreColor(v)}>{v}分</Tag> : '-'),
    },
    {
      title: t('apptest.vulnerabilities'),
      key: 'vulns',
      width: 180,
      render: (_: unknown, record: AppTestTaskSummary) => {
        const totalV = record.vuln_high + record.vuln_mid + record.vuln_low
        if (totalV === 0) return <Tag color="success">{t('apptest.noRisk')}</Tag>
        return (
          <Space size={4}>
            {record.vuln_high > 0 && <Tag color="error">{t('apptest.gradeHigh')} {record.vuln_high}</Tag>}
            {record.vuln_mid > 0 && <Tag color="warning">{t('apptest.gradeMid')} {record.vuln_mid}</Tag>}
            {record.vuln_low > 0 && <Tag>{t('apptest.gradeLow')} {record.vuln_low}</Tag>}
          </Space>
        )
      },
    },
    {
      title: t('apptest.completedAt'),
      dataIndex: 'completed_at',
      key: 'completed_at',
      width: 175,
      sorter: (a: AppTestTaskSummary, b: AppTestTaskSummary) =>
        new Date(a.completed_at || 0).getTime() - new Date(b.completed_at || 0).getTime(),
      defaultSortOrder: 'descend' as const,
      render: (v: string | null) => formatDateTime(v),
    },
    {
      title: t('common.operation'),
      key: 'action',
      width: 200,
      render: (_: unknown, record: AppTestTaskSummary) => (
        <Space>
          <Button
            size="small"
            icon={<FileWordOutlined />}
            loading={downloading === `${record.id}-1`}
            onClick={() => handleDownload(record.id, record.name, 1)}
          >
            Word
          </Button>
          <Button
            size="small"
            icon={<FilePdfOutlined />}
            loading={downloading === `${record.id}-2`}
            onClick={() => handleDownload(record.id, record.name, 2)}
          >
            PDF
          </Button>
        </Space>
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
        <Space style={{ marginBottom: 16 }} wrap>
          <Search
            placeholder={t('apptest.searchPlaceholder')}
            allowClear
            onChange={(e) => { if (!e.target.value) setSearchKeyword('') }}
            onSearch={(v) => setSearchKeyword(v.trim())}
            style={{ width: 250 }}
          />
          <Select
            placeholder={t('apptest.filterByType')}
            allowClear
            style={{ width: 140 }}
            onChange={(v) => setTerminalFilter(v || undefined)}
            options={TERMINAL_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          />
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={displayTasks}
          loading={loading}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description={t('apptest.noCompletedTasks')} /> }}
          pagination={{ pageSize: 20, showTotal: (tt) => `${t('common.total')} ${tt}` }}
        />
      </ProCard>
    </PageContainer>
  )
}
