import { useEffect, useRef, useState } from 'react'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import {
  Button, Space, Table, Tag, Progress, Input, Select, message, Popconfirm,
  Tooltip, Empty, Dropdown,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  PlusOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined,
  DownloadOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { apptestApi } from '../../services/api'
import type { AppTestTaskSummary } from '../../types'
import {
  getTerminalTypeColor, getTerminalTypeLabel, getStatusConfig, getScoreColor,
  formatDateTime, TERMINAL_TYPE_OPTIONS,
} from '../../types/apptest'

const { Search } = Input

const ACTIVE_STATUSES = ['uploading', 'running']

export default function AppTestListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<AppTestTaskSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(20)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [terminalFilter, setTerminalFilter] = useState<number | undefined>(undefined)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async (p = page, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const resp = await apptestApi.listTasks({
        page: p,
        per_page: perPage,
        status: statusFilter,
        terminal_type: terminalFilter,
      })
      setTasks(resp.data.tasks || [])
      setTotal(resp.data.total || 0)
    } catch (err: any) {
      if (!silent) message.error(err.response?.data?.detail || t('common.loadFailed'))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load(1)
    setPage(1)
  }, [statusFilter, terminalFilter])

  // Auto-refresh (silent) while any task is uploading/running.
  useEffect(() => {
    const hasActive = tasks.some(tk => ACTIVE_STATUSES.includes(tk.status))
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(() => load(page, true), 5000)
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [tasks, page])

  const handleDelete = async (id: string) => {
    try {
      await apptestApi.deleteTask(id)
      message.success(t('common.deleteSuccess'))
      load()
    } catch (err: any) {
      message.error(err.response?.data?.detail || t('common.deleteFailed'))
    }
  }

  const handleDownload = async (id: string, name: string, reportType: number) => {
    setDownloadingId(id)
    try {
      const resp = await apptestApi.getReport(id, reportType)
      const blob = new Blob([resp.data])
      const ct: string = resp.headers?.['content-type'] || ''
      const ext = ct.includes('pdf') ? '.pdf' : ct.includes('word') ? '.docx' : (reportType === 1 ? '.docx' : '.pdf')
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${name}_report${ext}`
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

  // Client-side keyword filter over the current page (non-destructive).
  const displayTasks = searchKeyword
    ? tasks.filter(tk =>
        tk.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        (tk.package_name && tk.package_name.toLowerCase().includes(searchKeyword.toLowerCase()))
      )
    : tasks

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
      render: (v: number) => (
        <Tag color={getTerminalTypeColor(v)}>{getTerminalTypeLabel(v)}</Tag>
      ),
    },
    {
      title: t('apptest.status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (v: string, record: AppTestTaskSummary) => {
        const cfg = getStatusConfig(v)
        if (v === 'failed') {
          return (
            <Tooltip title={record.error_message || t('apptest.detectionFailed')}>
              <Tag color={cfg.color} icon={<ExclamationCircleOutlined />}>{cfg.label}</Tag>
            </Tooltip>
          )
        }
        return (
          <Space direction="vertical" size={0}>
            <Tag color={cfg.color}>{cfg.label}</Tag>
            {v === 'running' && (
              <Progress percent={Math.round(record.progress * 100)} size="small" status="active" />
            )}
          </Space>
        )
      },
    },
    {
      title: (
        <Tooltip title={`${t('apptest.gradeHigh')} <60 / ${t('apptest.gradeMid')} 60-80 / ${t('apptest.gradeLow')} ≥80`}>
          <span>{t('apptest.score')}</span>
        </Tooltip>
      ),
      dataIndex: 'score',
      key: 'score',
      width: 100,
      sorter: (a: AppTestTaskSummary, b: AppTestTaskSummary) => (a.score ?? -1) - (b.score ?? -1),
      render: (v?: number) => (
        v !== null && v !== undefined
          ? <Tag color={getScoreColor(v)}>{v}分</Tag>
          : '-'
      ),
    },
    {
      title: t('apptest.vulnerabilities'),
      key: 'vulns',
      width: 180,
      render: (_: unknown, record: AppTestTaskSummary) => {
        const totalV = record.vuln_high + record.vuln_mid + record.vuln_low
        if (record.status !== 'completed') return '-'
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
      title: t('apptest.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 175,
      sorter: (a: AppTestTaskSummary, b: AppTestTaskSummary) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend' as const,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: t('common.operation'),
      key: 'action',
      width: 210,
      fixed: 'right' as const,
      render: (_: unknown, record: AppTestTaskSummary) => {
        const reportMenu: MenuProps = {
          items: [
            { key: 'word', label: 'Word', onClick: () => handleDownload(record.id, record.name, 1) },
            { key: 'pdf', label: 'PDF', onClick: () => handleDownload(record.id, record.name, 2) },
          ],
        }
        return (
          <Space size={4}>
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/apptest/${record.id}`)}
            >
              {t('common.detail')}
            </Button>
            <Dropdown menu={reportMenu} disabled={record.status !== 'completed'} trigger={['click']}>
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                loading={downloadingId === record.id}
                disabled={record.status !== 'completed'}
              >
                {t('apptest.downloadReport')}
              </Button>
            </Dropdown>
            <Popconfirm
              title={t('common.confirmDelete')}
              onConfirm={() => handleDelete(record.id)}
            >
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                {t('common.delete')}
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <PageContainer
      title={t('sidebar.apptest')}
      subTitle={t('apptest.subtitle')}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>
          {t('common.refresh')}
        </Button>,
        <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/apptest/new')}>
          {t('apptest.newTask')}
        </Button>,
      ]}
    >
      <ProCard>
        <Space style={{ marginBottom: 16 }} wrap>
          <Search
            placeholder={t('apptest.searchPlaceholder')}
            allowClear
            onChange={(e) => { if (!e.target.value) setSearchKeyword('') }}
            onSearch={(value) => setSearchKeyword(value.trim())}
            style={{ width: 250 }}
          />
          <Select
            placeholder={t('apptest.filterByStatus')}
            allowClear
            style={{ width: 140 }}
            onChange={(v) => setStatusFilter(v || undefined)}
            options={[
              { value: 'uploading', label: t('apptest.statusUploading') },
              { value: 'running', label: t('apptest.statusRunning') },
              { value: 'completed', label: t('apptest.statusCompleted') },
              { value: 'failed', label: t('apptest.statusFailed') },
            ]}
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
          scroll={{ x: 1100 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('apptest.noCompletedTasks')}
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/apptest/new')}>
                  {t('apptest.newTask')}
                </Button>
              </Empty>
            ),
          }}
          pagination={{
            current: page,
            pageSize: perPage,
            total,
            showSizeChanger: false,
            showTotal: (tt) => `${t('common.total') || '共'} ${tt}`,
            onChange: (p) => {
              setPage(p)
              load(p)
            },
          }}
        />
      </ProCard>
    </PageContainer>
  )
}
