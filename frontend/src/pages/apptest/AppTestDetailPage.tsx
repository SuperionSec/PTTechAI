import { useEffect, useState, useRef, useMemo } from 'react'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import {
  Button, Space, Tag, Progress, Descriptions, Table, message, Spin,
  Modal, Typography, Card, Row, Col, Statistic, Empty, Tabs, Alert, Switch, Input, Select,
} from 'antd'
import {
  ArrowLeftOutlined, ReloadOutlined, FileTextOutlined,
  BugOutlined, SafetyOutlined, WarningOutlined, KeyOutlined,
  ApiOutlined, ThunderboltOutlined, HistoryOutlined,
} from '@ant-design/icons'
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { apptestApi } from '../../services/api'
import type { AppTestTask, AppTestVulnerability } from '../../types'
import type { AppTestTaskDetail, AppTestVersionHistory } from '../../types/apptest'
import {
  getTerminalTypeColor, getTerminalTypeLabel, getStatusConfig, getScoreColor,
  getGradeColor, formatDateTime,
} from '../../types/apptest'

const { Text, Paragraph } = Typography

export default function AppTestDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { taskId } = useParams<{ taskId: string }>()
  const [loading, setLoading] = useState(false)
  const [task, setTask] = useState<AppTestTask | null>(null)
  const [vulns, setVulns] = useState<AppTestVulnerability[]>([])
  const [vulnLoading, setVulnLoading] = useState(false)
  const [selectedVuln, setSelectedVuln] = useState<AppTestVulnerability | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [detail, setDetail] = useState<AppTestTaskDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [versionHistory, setVersionHistory] = useState<AppTestVersionHistory | null>(null)
  const [versionLoading, setVersionLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState<number | null>(null)
  // vuln filters
  const [onlyRisks, setOnlyRisks] = useState(true)
  const [gradeFilter, setGradeFilter] = useState<string | undefined>(undefined)
  const [vulnSearch, setVulnSearch] = useState('')
  // permission filter
  const [onlySensitive, setOnlySensitive] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadDetail = async () => {
    if (!taskId) return
    setDetailLoading(true)
    try {
      const resp = await apptestApi.getTaskDetail(taskId)
      setDetail(resp.data)
    } catch {
      // detail only available for Android/SDK/HarmonyOS completed tasks
    } finally {
      setDetailLoading(false)
    }
  }

  const loadVersionHistory = async () => {
    if (!taskId) return
    setVersionLoading(true)
    try {
      const resp = await apptestApi.getVersionHistory(taskId)
      setVersionHistory(resp.data)
    } catch {
      // ignore
    } finally {
      setVersionLoading(false)
    }
  }

  const loadTask = async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const resp = await apptestApi.getTask(taskId)
      setTask(resp.data)
    } catch (err: any) {
      message.error(err.response?.data?.detail || t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  const loadVulns = async () => {
    if (!taskId) return
    setVulnLoading(true)
    try {
      const resp = await apptestApi.getVulns(taskId)
      setVulns(resp.data.vulnerabilities || [])
    } catch {
      // Silently fail - vulns may not be ready yet
    } finally {
      setVulnLoading(false)
    }
  }

  const loadStatus = async () => {
    if (!taskId) return
    try {
      const resp = await apptestApi.getStatus(taskId)
      const statusData = resp.data
      setTask(prev => prev ? { ...prev, ...statusData, status: statusData.status, progress: statusData.progress } : null)
      if (statusData.status === 'completed' || statusData.status === 'failed') {
        loadTask()
        loadVulns()
        loadDetail()
        loadVersionHistory()
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    } catch {
      // ignore polling errors
    }
  }

  useEffect(() => {
    loadTask()
    loadVulns()
    loadDetail()
    loadVersionHistory()
  }, [taskId])

  useEffect(() => {
    if (task?.status === 'running' || task?.status === 'uploading') {
      pollRef.current = setInterval(loadStatus, 5000)
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [task?.status])

  const handleDownloadReport = async (reportType: number) => {
    if (!taskId) return
    setReportLoading(reportType)
    try {
      const resp = await apptestApi.getReport(taskId, reportType)
      const blob = new Blob([resp.data])
      const ct: string = resp.headers?.['content-type'] || ''
      const ext = ct.includes('pdf') ? '.pdf' : ct.includes('word') ? '.docx' : (reportType === 1 ? '.docx' : '.pdf')
      const filename = `${task?.name || 'report'}${ext}`
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
      setReportLoading(null)
    }
  }

  // Filtered vulnerabilities
  const filteredVulns = useMemo(() => {
    return vulns.filter(v => {
      if (onlyRisks && (v.result === '安全' || v.result === '')) return false
      if (gradeFilter) {
        const gc = getGradeColor(v.grade, v.grade_value)
        if (gradeFilter === 'high' && gc !== 'error') return false
        if (gradeFilter === 'mid' && gc !== 'warning') return false
        if (gradeFilter === 'low' && gc !== 'default') return false
      }
      if (vulnSearch && !v.name.toLowerCase().includes(vulnSearch.toLowerCase())) return false
      return true
    })
  }, [vulns, onlyRisks, gradeFilter, vulnSearch])

  const filteredPermissions = useMemo(() => {
    const perms = detail?.permissions || []
    return onlySensitive ? perms.filter(p => p.is_sensitive === '是') : perms
  }, [detail, onlySensitive])

  const vulnColumns = [
    { title: t('apptest.vulnName'), dataIndex: 'name', key: 'name', width: 250 },
    { title: t('apptest.vulnType'), dataIndex: 'type_name', key: 'type_name', width: 150, render: (v: string) => v || '-' },
    {
      title: t('apptest.vulnGrade'),
      dataIndex: 'grade',
      key: 'grade',
      width: 100,
      render: (v: string, record: AppTestVulnerability) => (
        <Tag color={getGradeColor(v, record.grade_value)}>{v || '-'}</Tag>
      ),
    },
    {
      title: t('apptest.vulnResult'),
      dataIndex: 'result',
      key: 'result',
      width: 120,
      render: (v: string) => {
        const isSafe = v === '安全'
        return <Tag color={isSafe ? 'success' : v === '危险' || v === '存在风险' ? 'error' : 'warning'} style={isSafe ? { opacity: 0.65 } : undefined}>{v || '-'}</Tag>
      },
    },
    {
      title: t('common.operation'),
      key: 'action',
      width: 100,
      render: (_: unknown, record: AppTestVulnerability) => (
        <Button
          type="link"
          size="small"
          onClick={() => {
            setSelectedVuln(record)
            setModalOpen(true)
          }}
        >
          {t('common.detail')}
        </Button>
      ),
    },
  ]

  const statusCfg = task ? getStatusConfig(task.status) : { label: '-', color: 'default' }
  const totalVulns = task ? task.vuln_high + task.vuln_mid + task.vuln_low : 0

  return (
    <PageContainer
      title={task?.name || t('apptest.detailTitle')}
      extra={[
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => navigate('/apptest')}>
          {t('common.back')}
        </Button>,
        <Button key="refresh" icon={<ReloadOutlined />} onClick={() => { loadTask(); loadVulns(); loadDetail() }} loading={loading}>
          {t('common.refresh')}
        </Button>,
        ...(task?.status === 'completed' ? [
          <Button key="word" icon={<FileTextOutlined />} loading={reportLoading === 1} onClick={() => handleDownloadReport(1)}>
            Word
          </Button>,
          <Button key="pdf" icon={<FileTextOutlined />} loading={reportLoading === 2} onClick={() => handleDownloadReport(2)}>
            PDF
          </Button>,
        ] : []),
      ]}
    >
      <Spin spinning={loading}>
        {task && (
          <>
            {/* Failed alert */}
            {task.status === 'failed' && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
                message={t('apptest.detectionFailed')}
                description={task.error_message || '-'}
              />
            )}

            {/* Uploading / running progress banner */}
            {task.status === 'uploading' && (
              <Alert
                type="info"
                showIcon
                icon={<Spin size="small" />}
                style={{ marginBottom: 16 }}
                message={t('apptest.uploadingHint')}
              />
            )}
            {task.status === 'running' && (
              <ProCard style={{ marginBottom: 16 }}>
                <Text strong>{t('apptest.progress')}</Text>
                <Progress percent={Math.round(task.progress * 100)} status="active" />
                <Text type="secondary" style={{ fontSize: 12 }}>{t('apptest.estimatedTime')}</Text>
              </ProCard>
            )}

            {/* Basic Info */}
            <ProCard title={t('apptest.basicInfo')} style={{ marginBottom: 16 }}>
              <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
                <Descriptions.Item label={t('apptest.appName')}>{task.name}</Descriptions.Item>
                <Descriptions.Item label={t('apptest.terminalType')}>
                  <Tag color={getTerminalTypeColor(task.terminal_type)}>
                    {getTerminalTypeLabel(task.terminal_type)}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('apptest.status')}>
                  <Tag color={statusCfg.color}>{statusCfg.label}</Tag>
                </Descriptions.Item>
                {(task.version || detail?.base_info.version_name) && (
                  <Descriptions.Item label={t('apptest.version')}>{task.version || detail?.base_info.version_name}</Descriptions.Item>
                )}
                {(task.package_name || detail?.base_info.package_name) && (
                  <Descriptions.Item label={t('apptest.packageName')}>{task.package_name || detail?.base_info.package_name}</Descriptions.Item>
                )}
                {(task.file_size || detail?.base_info.apk_size) && (
                  <Descriptions.Item label={t('apptest.fileSize')}>{task.file_size || detail?.base_info.apk_size}</Descriptions.Item>
                )}
                {detail?.base_info.encrypt_detail && (
                  <Descriptions.Item label={t('apptest.encryptStatus')}>
                    <Tag color={detail.base_info.encrypt_detail.includes('未') ? 'warning' : 'success'}>
                      {detail.base_info.encrypt_detail}
                    </Tag>
                  </Descriptions.Item>
                )}
                {(task.md5 || detail?.base_info.apk_md5) && (
                  <Descriptions.Item label={t('apptest.md5')}>
                    <Text copyable style={{ fontSize: 12 }}>{task.md5 || detail?.base_info.apk_md5}</Text>
                  </Descriptions.Item>
                )}
                {detail?.base_info.sign_md5 && (
                  <Descriptions.Item label={t('apptest.signMd5')}>
                    <Text copyable style={{ fontSize: 12 }}>{detail.base_info.sign_md5}</Text>
                  </Descriptions.Item>
                )}
                {task.template_name && (
                  <Descriptions.Item label={t('apptest.strategy')}>{task.template_name}</Descriptions.Item>
                )}
                <Descriptions.Item label={t('apptest.createdAt')}>{formatDateTime(task.created_at)}</Descriptions.Item>
                {task.completed_at && (
                  <Descriptions.Item label={t('apptest.completedAt')}>{formatDateTime(task.completed_at)}</Descriptions.Item>
                )}
              </Descriptions>
              {detail?.base_info.sign_detail && (
                <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
                  <Descriptions.Item label={t('apptest.signInfo')}>
                    <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{detail.base_info.sign_detail}</Text>
                  </Descriptions.Item>
                </Descriptions>
              )}
            </ProCard>

            {/* Score & Stats */}
            {task.status === 'completed' && (
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={8}>
                  <Card>
                    <Statistic
                      title={t('apptest.score')}
                      value={task.score ?? '-'}
                      prefix={<SafetyOutlined />}
                      valueStyle={{
                        color: (task.score || 0) >= 80 ? '#52c41a'
                          : (task.score || 0) >= 60 ? '#faad14'
                          : '#f5222d',
                      }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card>
                    <Statistic
                      title={t('apptest.highRisk')}
                      value={task.vuln_high}
                      suffix={totalVulns > 0 ? <span style={{ fontSize: 12, color: '#999' }}>/ {totalVulns} ({Math.round(task.vuln_high / totalVulns * 100)}%)</span> : undefined}
                      prefix={<WarningOutlined />}
                      valueStyle={{ color: '#f5222d' }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card>
                    <Statistic
                      title={t('apptest.totalVulns')}
                      value={totalVulns}
                      prefix={<BugOutlined />}
                    />
                  </Card>
                </Col>
              </Row>
            )}

            {/* Tabs */}
            <ProCard>
              <Tabs
                defaultActiveKey="vulns"
                items={[
                  {
                    key: 'vulns',
                    label: <Space><BugOutlined />{t('apptest.vulnerabilityList')}{vulns.length > 0 && <Tag>{vulns.length}</Tag>}</Space>,
                    children: (
                      <>
                        {vulns.length > 0 && (
                          <Space style={{ marginBottom: 12 }} wrap>
                            <Space size={4}>
                              <Switch size="small" checked={onlyRisks} onChange={setOnlyRisks} />
                              <Text>{t('apptest.onlyRisks')}</Text>
                            </Space>
                            <Select
                              placeholder={t('apptest.filterByGrade')}
                              allowClear
                              size="small"
                              style={{ width: 130 }}
                              value={gradeFilter}
                              onChange={(v) => setGradeFilter(v)}
                              options={[
                                { value: 'high', label: t('apptest.gradeHigh') },
                                { value: 'mid', label: t('apptest.gradeMid') },
                                { value: 'low', label: t('apptest.gradeLow') },
                              ]}
                            />
                            <Input.Search
                              placeholder={t('apptest.searchVuln')}
                              allowClear
                              size="small"
                              style={{ width: 200 }}
                              onChange={(e) => { if (!e.target.value) setVulnSearch('') }}
                              onSearch={(v) => setVulnSearch(v.trim())}
                            />
                          </Space>
                        )}
                        {filteredVulns.length === 0 && !vulnLoading ? (
                          <Empty description={
                            vulns.length > 0
                              ? t('apptest.noRisk')
                              : task.status === 'running' || task.status === 'uploading'
                              ? t('apptest.waitingForDetection')
                              : task.status === 'completed'
                              ? t('apptest.noVulnerabilities')
                              : t('apptest.detectionNotCompleted')
                          } />
                        ) : (
                          <Table rowKey={(r) => r.id || r.name} columns={vulnColumns} dataSource={filteredVulns} loading={vulnLoading} pagination={{ pageSize: 20, showTotal: (tt) => `${t('common.total')} ${tt}` }} size="small" />
                        )}
                      </>
                    ),
                  },
                  {
                    key: 'permissions',
                    label: <Space><KeyOutlined />{t('apptest.permissions')}{detail && detail.permission_count > 0 && <Tag>{detail.permission_count}</Tag>}</Space>,
                    children: (
                      <>
                        {(detail?.permissions.length ?? 0) > 0 && (
                          <Space style={{ marginBottom: 12 }} size={4}>
                            <Switch size="small" checked={onlySensitive} onChange={setOnlySensitive} />
                            <Text>{t('apptest.onlySensitive')}</Text>
                            {detail && detail.sensitive_permission_count > 0 && <Tag color="red">{detail.sensitive_permission_count}</Tag>}
                          </Space>
                        )}
                        <Table
                          rowKey={(r) => r.permission_name}
                          loading={detailLoading}
                          dataSource={filteredPermissions}
                          size="small"
                          pagination={{ pageSize: 15 }}
                          locale={{ emptyText: <Empty description={t('apptest.noData')} /> }}
                          columns={[
                            { title: t('apptest.permName'), dataIndex: 'permission_name', key: 'name', ellipsis: true },
                            { title: t('apptest.permDesc'), dataIndex: 'permission_describe', key: 'desc', width: 140 },
                            { title: t('apptest.permGrade'), dataIndex: 'permission_grade', key: 'grade', width: 80, render: (v: string) => <Tag color={v.includes('高') ? 'error' : v.includes('中') ? 'warning' : 'default'}>{v || '-'}</Tag> },
                            { title: t('apptest.permSensitive'), dataIndex: 'is_sensitive', key: 'sens', width: 80, render: (v: string) => v === '是' ? <Tag color="red">{t('apptest.yes')}</Tag> : <Tag>{t('apptest.no')}</Tag> },
                            { title: t('apptest.permAbuse'), dataIndex: 'is_abuse', key: 'abuse', width: 80, render: (v: string) => v === '是' ? <Tag color="orange">{t('apptest.yes')}</Tag> : <Tag>{t('apptest.no')}</Tag> },
                          ]}
                        />
                      </>
                    ),
                  },
                  {
                    key: 'sdks',
                    label: <Space><ApiOutlined />{t('apptest.sdks')}{detail && detail.sdk_count > 0 && <Tag>{detail.sdk_count}</Tag>}</Space>,
                    children: (
                      <Table
                        rowKey={(r) => r.name + r.descript}
                        loading={detailLoading}
                        dataSource={detail?.sdks || []}
                        size="small"
                        pagination={{ pageSize: 15 }}
                        locale={{ emptyText: <Empty description={t('apptest.noData')} /> }}
                        columns={[
                          { title: t('apptest.sdkName'), dataIndex: 'descript', key: 'descript' },
                          { title: t('apptest.sdkType'), dataIndex: 'type_name', key: 'type', width: 100, render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '-' },
                          { title: t('apptest.sdkVendor'), dataIndex: 'vendor', key: 'vendor', width: 200, ellipsis: true },
                          { title: t('apptest.sdkPackage'), dataIndex: 'name', key: 'pkg', ellipsis: true },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'actions',
                    label: <Space><ThunderboltOutlined />{t('apptest.appActions')}{detail && detail.app_actions.length > 0 && <Tag>{detail.app_actions.length}</Tag>}</Space>,
                    children: (
                      <Table
                        rowKey={(r) => r.name + r.action_function}
                        loading={detailLoading}
                        dataSource={detail?.app_actions || []}
                        size="small"
                        pagination={false}
                        locale={{ emptyText: <Empty description={t('apptest.noData')} /> }}
                        columns={[
                          { title: t('apptest.actionName'), dataIndex: 'name', key: 'name', width: 200 },
                          { title: t('apptest.actionFunc'), dataIndex: 'action_function', key: 'func', ellipsis: true },
                          { title: t('apptest.actionPos'), dataIndex: 'action_function_position', key: 'pos', ellipsis: true },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'version',
                    label: <Space><HistoryOutlined />{t('apptest.versionHistory')}</Space>,
                    children: versionHistory && versionHistory.scores.length > 1 ? (
                      <div>
                        <ResponsiveContainer width="100%" height={280}>
                          <LineChart data={versionHistory.scores.map(s => ({ version: s.version, score: s.score ?? 0 }))}>
                            <XAxis dataKey="version" />
                            <YAxis domain={[0, 100]} />
                            <RTooltip />
                            <Legend />
                            <Line type="monotone" dataKey="score" name={t('apptest.score')} stroke="#1677ff" strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                        <Table
                          style={{ marginTop: 16 }}
                          rowKey={(r) => r.version + r.create_time}
                          loading={versionLoading}
                          dataSource={versionHistory.risks}
                          size="small"
                          pagination={false}
                          columns={[
                            { title: t('apptest.version'), dataIndex: 'version', key: 'v' },
                            { title: t('apptest.score'), dataIndex: 'score', key: 's', width: 90, render: (v?: number) => v != null ? <Tag color={getScoreColor(v)}>{v}</Tag> : '-' },
                            { title: t('apptest.highRisk'), dataIndex: 'apk_highrisk_count', key: 'h', width: 90, render: (v: number) => <span style={{ color: '#f5222d' }}>{v}</span> },
                            { title: t('apptest.midRisk'), dataIndex: 'apk_middlerisk_count', key: 'm', width: 90, render: (v: number) => <span style={{ color: '#faad14' }}>{v}</span> },
                            { title: t('apptest.lowRisk'), dataIndex: 'apk_lowrisk_count', key: 'l', width: 90 },
                            { title: t('apptest.createTime'), dataIndex: 'create_time', key: 'ct', width: 170, render: (v: string) => formatDateTime(v) },
                          ]}
                        />
                      </div>
                    ) : <Empty description={versionLoading ? t('common.loading') : t('apptest.singleVersionHint')} />,
                  },
                ]}
              />
            </ProCard>
          </>
        )}
      </Spin>

      {/* Vulnerability Detail Modal */}
      <Modal
        open={modalOpen}
        title={selectedVuln?.name}
        onCancel={() => setModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setModalOpen(false)}>{t('common.close')}</Button>,
        ]}
        width={800}
      >
        {selectedVuln && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label={t('apptest.vulnType')}>{selectedVuln.type_name || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('apptest.vulnGrade')}>
                <Tag color={getGradeColor(selectedVuln.grade, selectedVuln.grade_value)}>{selectedVuln.grade}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('apptest.vulnResult')} span={2}>
                <Tag color={selectedVuln.result === '安全' ? 'success' : 'error'}>{selectedVuln.result}</Tag>
              </Descriptions.Item>
            </Descriptions>

            {selectedVuln.purpose && selectedVuln.purpose !== '--' && (
              <Card size="small" title={t('apptest.vulnPurpose')}>
                <Paragraph style={{ marginBottom: 0 }}>{selectedVuln.purpose}</Paragraph>
              </Card>
            )}

            {selectedVuln.harm && selectedVuln.harm !== '--' && (
              <Alert type="error" showIcon message={t('apptest.vulnHarm')} description={<Paragraph style={{ marginBottom: 0 }}>{selectedVuln.harm}</Paragraph>} />
            )}

            {selectedVuln.solution && selectedVuln.solution !== 'N/A' && (
              <Alert type="success" showIcon message={t('apptest.vulnSolution')} description={<Paragraph style={{ marginBottom: 0 }}>{selectedVuln.solution}</Paragraph>} />
            )}

            {selectedVuln.result_detail && (
              <Card size="small" title={t('apptest.vulnResultDetail')}>
                <Paragraph style={{ marginBottom: 0 }}>{selectedVuln.result_detail}</Paragraph>
              </Card>
            )}

            {selectedVuln.describe && (
              <Card size="small" title={t('apptest.vulnDescribe')}>
                <Paragraph style={{ marginBottom: 0 }}>{selectedVuln.describe}</Paragraph>
              </Card>
            )}
          </Space>
        )}
      </Modal>
    </PageContainer>
  )
}
