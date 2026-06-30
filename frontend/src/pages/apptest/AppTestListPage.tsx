import { useEffect, useRef, useState } from 'react'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import {
  Button, Space, Table, Tag, Progress, Input, Select, message, Popconfirm,
} from 'antd'
import {
  PlusOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined,
  FileSearchOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { apptestApi } from '../../services/api'
import type { AppTestTaskSummary } from '../../types'
import { getTerminalTypeColor, getTerminalTypeLabel, getStatusConfig, TERMINAL_TYPE_OPTIONS } from '../../types/apptest'

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

  // Auto-refresh (silent) while any task is uploading/running, so users see
  // progress without manual refreshes.
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
      width: 120,
      render: (v: number) => (
        <Tag color={getTerminalTypeColor(v)}>{getTerminalTypeLabel(v)}</Tag>
      ),
    },
    {
      title: t('apptest.status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (v: string, record: AppTestTaskSummary) => {
        const cfg = getStatusConfig(v)
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
      title: t('apptest.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
    },
    {
      title: t('common.operation'),
      key: 'action',
      width: 200,
      render: (_: unknown, record: AppTestTaskSummary) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/apptest/${record.id}`)}
          >
            {t('common.detail')}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<FileSearchOutlined />}
            onClick={() => navigate(`/apptest/${record.id}/report`)}
            disabled={record.status !== 'completed'}
          >
            {t('apptest.report')}
          </Button>
          <Popconfirm
            title={t('common.confirmDelete')}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
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
          pagination={{
            current: page,
            pageSize: perPage,
            total,
            showSizeChanger: false,
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
