import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  App as AntApp,
  Button,
  Checkbox,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import {
  CalendarOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { relativeTime } from '../utils/time'
import { schedulerApi } from '../services/api'
import type { AgentRole, ScheduleJob } from '../types'

const { Text } = Typography

type ScheduleMode = 'preset' | 'days' | 'interval'

interface ScheduleFormValues {
  job_id: string
  target: string
  scan_type: string
  agent_role?: string
  schedule_mode: ScheduleMode
  cron_preset: string
  custom_cron?: string
  interval_minutes?: number
  selected_days?: number[]
  execution_hour: string
  execution_minute: string
}

const getCronPresets = (t: any) => [
  { label: t('scheduler.everyHour'), value: '0 * * * *', desc: t('scheduler.everyHourDesc') },
  { label: t('scheduler.every6Hours'), value: '0 */6 * * *', desc: t('scheduler.every6HoursDesc') },
  { label: t('scheduler.daily2AM'), value: '0 2 * * *', desc: t('scheduler.daily2AMDesc') },
  { label: t('scheduler.dailyMidnight'), value: '0 0 * * *', desc: t('scheduler.dailyMidnightDesc') },
  { label: t('scheduler.weekdays9AM'), value: '0 9 * * 1-5', desc: t('scheduler.weekdays9AMDesc') },
  { label: t('scheduler.weeklyMonday'), value: '0 0 * * 1', desc: t('scheduler.weeklyMondayDesc') },
  { label: t('scheduler.weeklyFriday'), value: '0 18 * * 5', desc: t('scheduler.weeklyFridayDesc') },
  { label: t('scheduler.monthly1st'), value: '0 0 1 * *', desc: t('scheduler.monthly1stDesc') },
  { label: t('scheduler.customCron'), value: 'custom', desc: t('scheduler.customCronDesc') },
]

const getScanTypes = (t: any) => [
  { label: t('scheduler.quickScan'), value: 'quick', desc: t('scheduler.quickScanDesc') },
  { label: t('scheduler.fullScan'), value: 'full', desc: t('scheduler.fullScanDesc') },
  { label: t('scheduler.customScan'), value: 'custom', desc: t('scheduler.customScanDesc') },
]

const getDaysOfWeek = (t: any) => [
  { label: t('scheduler.sundayShort'), value: 0, full: t('scheduler.sunday') },
  { label: t('scheduler.mondayShort'), value: 1, full: t('scheduler.monday') },
  { label: t('scheduler.tuesdayShort'), value: 2, full: t('scheduler.tuesday') },
  { label: t('scheduler.wednesdayShort'), value: 3, full: t('scheduler.wednesday') },
  { label: t('scheduler.thursdayShort'), value: 4, full: t('scheduler.thursday') },
  { label: t('scheduler.fridayShort'), value: 5, full: t('scheduler.friday') },
  { label: t('scheduler.saturdayShort'), value: 6, full: t('scheduler.saturday') },
]

const intervalOptions = [15, 30, 60, 120, 240, 360, 720, 1440]

function defaultFormValues(): ScheduleFormValues {
  return {
    job_id: '',
    target: '',
    scan_type: 'quick',
    schedule_mode: 'preset',
    cron_preset: '0 2 * * *',
    interval_minutes: 60,
    selected_days: [1, 2, 3, 4, 5],
    execution_hour: '02',
    execution_minute: '00',
  }
}

function buildCronExpression(values: ScheduleFormValues): string | undefined {
  if (values.schedule_mode === 'interval') return undefined
  if (values.schedule_mode === 'preset') return values.cron_preset === 'custom' ? values.custom_cron : values.cron_preset
  const days = values.selected_days || []
  if (days.length === 0) return undefined
  return `${values.execution_minute} ${values.execution_hour} * * ${[...days].sort((a, b) => a - b).join(',')}`
}

function intervalDisplayText(minutes?: number): string {
  const mins = minutes || 60
  if (mins >= 60) {
    const hours = Math.floor(mins / 60)
    const remaining = mins % 60
    return remaining > 0 ? `${hours}h ${remaining}m` : `${hours} hour(s)`
  }
  return `${mins} minutes`
}

export default function SchedulerPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const cronPresets = useMemo(() => getCronPresets(t), [t])
  const scanTypes = useMemo(() => getScanTypes(t), [t])
  const daysOfWeek = useMemo(() => getDaysOfWeek(t), [t])
  const [jobs, setJobs] = useState<ScheduleJob[]>([])
  const [agentRoles, setAgentRoles] = useState<AgentRole[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form] = Form.useForm<ScheduleFormValues>()
  const scheduleMode = Form.useWatch('schedule_mode', form) || 'preset'
  const cronPreset = Form.useWatch('cron_preset', form) || '0 2 * * *'
  const intervalMinutes = Form.useWatch('interval_minutes', form) || 60
  const selectedDays = Form.useWatch('selected_days', form) || []
  const executionHour = Form.useWatch('execution_hour', form) || '02'
  const executionMinute = Form.useWatch('execution_minute', form) || '00'

  const activeJobCount = useMemo(() => jobs.filter(job => job.status === 'active').length, [jobs])
  const totalRunCount = useMemo(() => jobs.reduce((sum, job) => sum + job.run_count, 0), [jobs])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [jobsData, rolesData] = await Promise.all([schedulerApi.list(), schedulerApi.getAgentRoles()])
      setJobs(jobsData)
      setAgentRoles(rolesData)
    } catch (error) {
      console.error('Failed to fetch scheduler data:', error)
      notification.error({ message: t('scheduler.failedToRefresh') })
    } finally {
      setLoading(false)
    }
  }, [notification, t])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchData()
      notification.info({ message: t('scheduler.schedulesRefreshed') })
    } finally {
      setRefreshing(false)
    }
  }, [fetchData, notification, t])

  const openCreateDrawer = () => {
    form.setFieldsValue(defaultFormValues())
    setDrawerOpen(true)
  }

  const closeCreateDrawer = () => {
    setDrawerOpen(false)
    form.resetFields()
  }

  const handleCreate = async () => {
    const values = await form.validateFields()
    const cron = buildCronExpression(values)
    const interval = values.schedule_mode === 'interval' ? values.interval_minutes || 60 : undefined
    if (!cron && !interval) {
      notification.error({ message: t('scheduler.configureSchedule') })
      return
    }

    setCreating(true)
    try {
      await schedulerApi.create({
        job_id: values.job_id.trim(),
        target: values.target.trim(),
        scan_type: values.scan_type,
        cron_expression: cron,
        interval_minutes: interval,
        agent_role: values.agent_role || undefined,
      })
      notification.success({ message: `Schedule "${values.job_id}" created successfully` })
      closeCreateDrawer()
      await fetchData()
    } catch (error: any) {
      notification.error({ message: error.response?.data?.detail || t('scheduler.failedToCreate') })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (job: ScheduleJob) => {
    try {
      await schedulerApi.delete(job.id)
      notification.success({ message: `Schedule "${job.id}" deleted` })
      await fetchData()
    } catch {
      notification.error({ message: `Failed to delete "${job.id}"` })
    }
  }

  const handlePause = async (job: ScheduleJob) => {
    try {
      await schedulerApi.pause(job.id)
      notification.info({ message: `Schedule "${job.id}" paused` })
      await fetchData()
    } catch {
      notification.error({ message: `Failed to pause "${job.id}"` })
    }
  }

  const handleResume = async (job: ScheduleJob) => {
    try {
      await schedulerApi.resume(job.id)
      notification.success({ message: `Schedule "${job.id}" resumed` })
      await fetchData()
    } catch {
      notification.error({ message: `Failed to resume "${job.id}"` })
    }
  }

  const scheduleSummaryText = useMemo(() => {
    if (scheduleMode === 'interval') return `Runs every ${intervalDisplayText(intervalMinutes)}`
    if (scheduleMode === 'days' && selectedDays.length > 0) {
      const dayNames = [...selectedDays].sort((a, b) => a - b).map(day => daysOfWeek.find(item => item.value === day)?.label || day).join(', ')
      return `Runs on ${dayNames} at ${executionHour}:${executionMinute}`
    }
    if (scheduleMode === 'preset' && cronPreset !== 'custom') return cronPresets.find(preset => preset.value === cronPreset)?.desc || ''
    return ''
  }, [scheduleMode, intervalMinutes, selectedDays, executionHour, executionMinute, cronPreset, cronPresets, daysOfWeek])

  const columns: ProColumns<ScheduleJob>[] = [
    {
      title: t('scheduler.jobId'),
      dataIndex: 'id',
      render: (_, job) => (
        <Space direction="vertical" size={2}>
          <Space wrap>
            <Text strong>{job.id}</Text>
            <Tag color={job.status === 'active' ? 'green' : 'gold'}>{job.status}</Tag>
            <Tag>{job.scan_type}</Tag>
            {job.agent_role && <Tag color="blue" icon={<SafetyCertificateOutlined />}>{job.agent_role.replace(/_/g, ' ')}</Tag>}
          </Space>
          <Text type="secondary">{job.target}</Text>
          <Text code>{job.schedule}</Text>
        </Space>
      ),
    },
    {
      title: t('scheduler.next'),
      dataIndex: 'next_run',
      width: 190,
      render: (_, job) => job.next_run ? <Text title={new Date(job.next_run).toLocaleString()}>{relativeTime(job.next_run, t)}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: t('scheduler.last'),
      dataIndex: 'last_run',
      width: 190,
      render: (_, job) => job.last_run ? <Text title={new Date(job.last_run).toLocaleString()}>{relativeTime(job.last_run, t)}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: t('scheduler.totalRuns'),
      dataIndex: 'run_count',
      width: 120,
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 140,
      render: (_, job) => [
        job.status === 'active' ? (
          <Button key="pause" size="small" icon={<PauseCircleOutlined />} onClick={() => handlePause(job)} />
        ) : (
          <Button key="resume" size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => handleResume(job)} />
        ),
        <Popconfirm
          key="delete"
          title={t('scheduler.deleteSchedule')}
          description={t('scheduler.deleteConfirm', { jobId: job.id })}
          okText={t('common.delete')}
          cancelText={t('common.cancel')}
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDelete(job)}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>,
      ],
    },
  ]

  return (
    <PageContainer
      title={t('scheduler.title')}
      subTitle={t('scheduler.subtitle')}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh}>{t('common.refresh')}</Button>,
        <Button key="create" type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>{t('scheduler.newSchedule')}</Button>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: t('scheduler.totalJobs'), value: jobs.length, icon: <CalendarOutlined /> }} />
          <StatisticCard statistic={{ title: t('scheduler.activeJobs'), value: activeJobCount, icon: <PlayCircleOutlined /> }} />
          <StatisticCard statistic={{ title: t('scheduler.totalRuns'), value: totalRunCount, icon: <ReloadOutlined /> }} />
        </StatisticCard.Group>

        <ProCard bordered title={`${t('scheduler.title')} (${jobs.length})`}>
          {loading ? (
            <Spin style={{ display: 'block', margin: '48px auto' }} />
          ) : jobs.length === 0 ? (
            <Empty description={t('scheduler.noScheduledJobs')}>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>{t('scheduler.newSchedule')}</Button>
            </Empty>
          ) : (
            <ProTable<ScheduleJob>
              rowKey="id"
              search={false}
              options={false}
              columns={columns}
              dataSource={jobs}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              toolBarRender={false}
            />
          )}
        </ProCard>
      </Space>

      <Drawer
        title={t('scheduler.createNewSchedule')}
        open={drawerOpen}
        width={760}
        onClose={closeCreateDrawer}
        extra={<Button type="primary" loading={creating} onClick={handleCreate}>{t('scheduler.newSchedule')}</Button>}
      >
        <Form form={form} layout="vertical" initialValues={defaultFormValues()}>
          <Form.Item name="job_id" label={t('scheduler.jobId')} extra={t('scheduler.jobIdHelper')} rules={[{ required: true, message: t('scheduler.jobIdRequired') }]}>
            <Input placeholder="weekly-internal-scan" />
          </Form.Item>
          <Form.Item name="target" label={t('scheduler.targetUrl')} rules={[{ required: true, message: t('scheduler.targetUrlRequired') }]}>
            <Input placeholder="https://example.com" />
          </Form.Item>
          <Form.Item name="scan_type" label={t('scheduler.scanType')} rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" options={scanTypes.map(type => ({ label: type.label, value: type.value }))} />
          </Form.Item>
          <Form.Item name="agent_role" label="Agent Role">
            <Select
              allowClear
              placeholder={t('scheduler.selectAgentRole')}
              options={agentRoles.map(role => ({ label: `${role.name} - ${role.description}`, value: role.id }))}
            />
          </Form.Item>

          <ProCard bordered size="small" title="Schedule" style={{ marginBottom: 24 }}>
            <Form.Item name="schedule_mode" label={t('scheduler.presets')} rules={[{ required: true }]}>
              <Radio.Group optionType="button" buttonStyle="solid" options={[
                { label: t('scheduler.presets'), value: 'preset' },
                { label: t('scheduler.daysAndTime'), value: 'days' },
                { label: t('scheduler.interval'), value: 'interval' },
              ]} />
            </Form.Item>

            {scheduleMode === 'preset' && (
              <>
                <Form.Item name="cron_preset" label={t('scheduler.presets')} rules={[{ required: true }]}>
                  <Select options={cronPresets.map(preset => ({ label: `${preset.label} - ${preset.desc}`, value: preset.value }))} />
                </Form.Item>
                {cronPreset === 'custom' && (
                  <Form.Item name="custom_cron" label={t('scheduler.customCronExpression')} rules={[{ required: true, message: t('scheduler.configureSchedule') }]} extra={t('scheduler.cronFormatHelper')}>
                    <Input placeholder="0 */4 * * *" />
                  </Form.Item>
                )}
              </>
            )}

            {scheduleMode === 'days' && (
              <>
                <Form.Item name="selected_days" label={t('scheduler.selectDaysOfWeek')} rules={[{ required: true, message: t('scheduler.configureSchedule') }]}>
                  <Checkbox.Group options={daysOfWeek.map(day => ({ label: day.label, value: day.value, title: day.full }))} />
                </Form.Item>
                <Space>
                  <Form.Item name="execution_hour" label={t('scheduler.executionTime')} rules={[{ required: true }]}>
                    <Select style={{ width: 96 }} options={Array.from({ length: 24 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: String(i).padStart(2, '0') }))} />
                  </Form.Item>
                  <Form.Item name="execution_minute" label=" " rules={[{ required: true }]}>
                    <Select style={{ width: 96 }} options={['00', '15', '30', '45'].map(minute => ({ label: minute, value: minute }))} />
                  </Form.Item>
                </Space>
                {selectedDays.length > 0 && <Text code>{`${executionMinute} ${executionHour} * * ${[...selectedDays].sort((a, b) => a - b).join(',')}`}</Text>}
              </>
            )}

            {scheduleMode === 'interval' && (
              <>
                <Form.Item name="interval_minutes" label={t('scheduler.interval')} rules={[{ required: true }]}>
                  <Select options={intervalOptions.map(value => ({ label: intervalDisplayText(value), value }))} />
                </Form.Item>
                <Form.Item name="interval_minutes" label={t('scheduler.customIntervalMinutes')}>
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
              </>
            )}

            {scheduleSummaryText && <Text type="secondary">{scheduleSummaryText}</Text>}
          </ProCard>
        </Form>
      </Drawer>
    </PageContainer>
  )
}
