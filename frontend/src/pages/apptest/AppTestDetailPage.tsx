import { useEffect, useState, useRef } from 'react'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import {
  Button, Space, Tag, Progress, Descriptions, Table, message, Spin,
  Modal, Typography, Card, Row, Col, Statistic, Empty, Tabs,
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
import { getTerminalTypeColor, getTerminalTypeLabel, getStatusConfig } from '../../types/apptest'

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
    } catch (err: any) {
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
    try {
      const resp = await apptestApi.getReport(taskId, reportType)
      const ext = reportType === 1 ? '.docx' : '.pdf'
      const filename = `${task?.name || 'report'}${ext}`
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
    }
  }

  const vulnColumns = [
    {
      title: t('apptest.vulnName'),
      dataIndex: 'name',
      key: 'name',
      width: 250,
    },
    {
      title: t('apptest.vulnType'),
      dataIndex: 'type_name',
      key: 'type_name',
      width: 150,
      render: (v: string) => v || '-',
    },
    {
      title: t('apptest.vulnGrade'),
      dataIndex: 'grade',
      key: 'grade',
      width: 100,
      render: (v: string, record: AppTestVulnerability) => {
        const color = record.grade_value === 3 || v.includes('高') ? 'error'
          : record.grade_value === 2 || v.includes('中') ? 'warning'
          : 'default'
        return <Tag color={color}>{v || '-'}</Tag>
      },
    },
    {
      title: t('apptest.vulnResult'),
      dataIndex: 'result',
      key: 'result',
      width: 120,
      render: (v: string) => (
        <Tag color={v === '安全' ? 'success' : v === '危险' ? 'error' : 'warning'}>{v || '-'}</Tag>
      ),
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

  return (
    <PageContainer
      title={task?.name || t('apptest.detailTitle')}
      extra={[
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => navigate('/apptest')}>
          {t('common.back')}
        </Button>,
        <Button key="refresh" icon={<ReloadOutlined />} onClick={() => { loadTask(); loadVulns(); }} loading={loading}>
          {t('common.refresh')}
        </Button>,
        task?.status === 'completed' && (
          <>
            <Button key="word" icon={<FileTextOutlined />} onClick={() => handleDownloadReport(1)}>
              Word
            </Button>
            <Button key="pdf" icon={<FileTextOutlined />} onClick={() => handleDownloadReport(2)}>
              PDF
            </Button>
          </>
        ),
      ]}
    >
      <Spin spinning={loading}>
        {task && (
          <>
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
                {task.version && (
                  <Descriptions.Item label={t('apptest.version')}>{task.version}</Descriptions.Item>
                )}
                {task.package_name && (
                  <Descriptions.Item label={t('apptest.packageName')}>{task.package_name}</Descriptions.Item>
                )}
                {task.file_size && (
                  <Descriptions.Item label={t('apptest.fileSize')}>{task.file_size}</Descriptions.Item>
                )}
                {task.md5 && (
                  <Descriptions.Item label={t('apptest.md5')}>
                    <Text copyable={{ text: task.md5 }} style={{ fontSize: 12 }}>
                      {task.md5.substring(0, 16)}...
                    </Text>
                  </Descriptions.Item>
                )}
                {task.template_name && (
                  <Descriptions.Item label={t('apptest.strategy')}>{task.template_name}</Descriptions.Item>
                )}
                <Descriptions.Item label={t('apptest.createdAt')}>{task.created_at}</Descriptions.Item>
                {task.completed_at && (
                  <Descriptions.Item label={t('apptest.completedAt')}>{task.completed_at}</Descriptions.Item>
                )}
              </Descriptions>

              {task.status === 'uploading' && (
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">{t('apptest.uploadingHint')}</Text>
                </div>
              )}
              {task.status === 'running' && (
                <div style={{ marginTop: 16 }}>
                  <Text>{t('apptest.progress')}:</Text>
                  <Progress percent={Math.round(task.progress * 100)} status="active" />
                </div>
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
                      prefix={<WarningOutlined />}
                      valueStyle={{ color: '#f5222d' }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card>
                    <Statistic
                      title={t('apptest.totalVulns')}
                      value={task.vuln_high + task.vuln_mid + task.vuln_low}
                      prefix={<BugOutlined />}
                    />
                  </Card>
                </Col>
              </Row>
            )}

            {/* Vulnerability List */}
            <ProCard>
              <Tabs
                defaultActiveKey="vulns"
                items={[
                  {
                    key: 'vulns',
                    label: <Space><BugOutlined />{t('apptest.vulnerabilityList')}{vulns.length > 0 && <Tag>{vulns.length}</Tag>}</Space>,
                    children: vulns.length === 0 && !vulnLoading ? (
                      <Empty description={
                        task.status === 'running' || task.status === 'uploading'
                          ? t('apptest.waitingForDetection')
                          : task.status === 'completed'
                          ? t('apptest.noVulnerabilities')
                          : t('apptest.detectionNotCompleted')
                      } />
                    ) : (
                      <Table rowKey="id" columns={vulnColumns} dataSource={vulns} loading={vulnLoading} pagination={{ pageSize: 20 }} size="small" />
                    ),
                  },
                  {
                    key: 'permissions',
                    label: <Space><KeyOutlined />{t('apptest.permissions')}{detail && detail.permission_count > 0 && <Tag>{detail.permission_count}</Tag>}</Space>,
                    children: (
                      <Table
                        rowKey={(r) => r.permission_name}
                        loading={detailLoading}
                        dataSource={detail?.permissions || []}
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
                    children: versionHistory && versionHistory.scores.length > 0 ? (
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
                            { title: t('apptest.score'), dataIndex: 'score', key: 's', width: 90, render: (v?: number) => v != null ? <Tag color={v >= 80 ? 'success' : v >= 60 ? 'warning' : 'error'}>{v}</Tag> : '-' },
                            { title: t('apptest.highRisk'), dataIndex: 'apk_highrisk_count', key: 'h', width: 90, render: (v: number) => <span style={{ color: '#f5222d' }}>{v}</span> },
                            { title: t('apptest.midRisk'), dataIndex: 'apk_middlerisk_count', key: 'm', width: 90, render: (v: number) => <span style={{ color: '#faad14' }}>{v}</span> },
                            { title: t('apptest.lowRisk'), dataIndex: 'apk_lowrisk_count', key: 'l', width: 90 },
                            { title: t('apptest.createTime'), dataIndex: 'create_time', key: 'ct', width: 170 },
                          ]}
                        />
                      </div>
                    ) : <Empty description={versionLoading ? t('common.loading') : t('apptest.noVersionHistory')} />,
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
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Descriptions column={1} size="small">
              <Descriptions.Item label={t('apptest.vulnType')}>
                {selectedVuln.type_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('apptest.vulnGrade')}>
                <Tag color={
                  selectedVuln.grade_value === 3 || selectedVuln.grade.includes('高') ? 'error'
                    : selectedVuln.grade_value === 2 || selectedVuln.grade.includes('中') ? 'warning'
                    : 'default'
                }>
                  {selectedVuln.grade}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('apptest.vulnResult')}>
                <Tag color={selectedVuln.result === '安全' ? 'success' : 'error'}>
                  {selectedVuln.result}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {selectedVuln.purpose && (
              <Card size="small" title={t('apptest.vulnPurpose')}>
                <Paragraph>{selectedVuln.purpose}</Paragraph>
              </Card>
            )}

            {selectedVuln.harm && (
              <Card size="small" title={t('apptest.vulnHarm')} type="inner">
                <Paragraph>{selectedVuln.harm}</Paragraph>
              </Card>
            )}

            {selectedVuln.solution && (
              <Card size="small" title={t('apptest.vulnSolution')}>
                <Paragraph>{selectedVuln.solution}</Paragraph>
              </Card>
            )}

            {selectedVuln.result_detail && (
              <Card size="small" title={t('apptest.vulnResultDetail')}>
                <Paragraph>{selectedVuln.result_detail}</Paragraph>
              </Card>
            )}

            {selectedVuln.describe && (
              <Card size="small" title={t('apptest.vulnDescribe')}>
                <Paragraph>{selectedVuln.describe}</Paragraph>
              </Card>
            )}
          </Space>
        )}
      </Modal>
    </PageContainer>
  )
}
