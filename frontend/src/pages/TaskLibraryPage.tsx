import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  App as AntApp,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import {
  BookOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  StarOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { agentApi } from '../services/api'
import type { AgentTask } from '../types'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface TaskFormValues {
  name: string
  description: string
  category: string
  prompt: string
  system_prompt?: string
  tags?: string
}

const getCategories = (t: any) => [
  { id: 'all', name: t('taskLibrary.allTasks'), color: 'default' },
  { id: 'full_auto', name: t('taskLibrary.fullAuto'), color: 'blue' },
  { id: 'recon', name: t('taskLibrary.reconnaissance'), color: 'cyan' },
  { id: 'vulnerability', name: t('taskLibrary.vulnerability'), color: 'orange' },
  { id: 'custom', name: t('taskLibrary.custom'), color: 'purple' },
  { id: 'reporting', name: t('taskLibrary.reporting'), color: 'green' },
]

function categoryColor(category: string) {
  const colors: Record<string, string> = {
    full_auto: 'blue',
    recon: 'cyan',
    vulnerability: 'orange',
    custom: 'purple',
    reporting: 'green',
  }
  return colors[category] || 'default'
}

export default function TaskLibraryPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const categories = useMemo(() => getCategories(t), [t])
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null)
  const [form] = Form.useForm<TaskFormValues>()

  const loadTasks = useCallback(async () => {
    try {
      const taskList = await agentApi.tasks.list()
      setTasks(taskList)
    } catch (error) {
      console.error('Failed to load tasks:', error)
      notification.error({ message: t('taskLibrary.failedToLoadTasks', 'Failed to load tasks') })
    }
  }, [notification, t])

  useEffect(() => {
    setLoading(true)
    loadTasks().finally(() => setLoading(false))
  }, [loadTasks])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadTasks()
      notification.info({ message: t('taskLibrary.tasksRefreshed', 'Tasks refreshed') })
    } finally {
      setRefreshing(false)
    }
  }, [loadTasks, notification, t])

  const filteredTasks = useMemo(() => {
    let filtered = [...tasks]
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(task => task.category === selectedCategory)
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(task =>
        task.name.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query) ||
        task.tags?.some(tag => tag.toLowerCase().includes(query))
      )
    }
    return filtered
  }, [tasks, selectedCategory, searchQuery])

  const stats = useMemo(() => ({
    total: tasks.length,
    presetCount: tasks.filter(task => task.is_preset).length,
    customCount: tasks.filter(task => !task.is_preset).length,
    categories: new Set(tasks.map(task => task.category)).size,
  }), [tasks])

  const resetCreateForm = () => {
    form.resetFields()
    form.setFieldsValue({ category: 'custom' })
  }

  const handleCreateTask = async () => {
    const values = await form.validateFields()
    setCreating(true)
    try {
      await agentApi.tasks.create({
        name: values.name,
        description: values.description,
        category: values.category,
        prompt: values.prompt,
        system_prompt: values.system_prompt || undefined,
        tags: values.tags?.split(',').map(tag => tag.trim()).filter(Boolean) || [],
      })
      await loadTasks()
      setCreateOpen(false)
      resetCreateForm()
      notification.success({ message: t('taskLibrary.taskCreated') })
    } catch (error) {
      console.error('Failed to create task:', error)
      notification.error({ message: t('taskLibrary.failedToCreateTask') })
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteTask = async (task: AgentTask) => {
    try {
      await agentApi.tasks.delete(task.id)
      await loadTasks()
      if (selectedTask?.id === task.id) setSelectedTask(null)
      notification.success({ message: t('taskLibrary.taskDeleted') })
    } catch (error) {
      console.error('Failed to delete task:', error)
      notification.error({ message: t('taskLibrary.failedToDeleteTask') })
    }
  }

  const handleRunTask = (task: AgentTask) => {
    navigate('/scan/new', { state: { selectedTaskId: task.id } })
  }

  const columns: ProColumns<AgentTask>[] = [
    {
      title: t('taskLibrary.name'),
      dataIndex: 'name',
      render: (_, task) => (
        <Space direction="vertical" size={2}>
          <Space wrap>
            <Text strong>{task.name}</Text>
            {task.is_preset && <Tag color="blue" icon={<StarOutlined />}>{t('taskLibrary.preset')}</Tag>}
          </Space>
          <Text type="secondary" ellipsis style={{ maxWidth: 480 }}>{task.description}</Text>
        </Space>
      ),
    },
    {
      title: t('taskLibrary.category'),
      dataIndex: 'category',
      width: 150,
      filters: categories.filter(category => category.id !== 'all').map(category => ({ text: category.name, value: category.id })),
      onFilter: (value, task) => task.category === value,
      render: (_, task) => <Tag color={categoryColor(task.category)}>{task.category}</Tag>,
    },
    {
      title: t('taskLibrary.tags'),
      dataIndex: 'tags',
      render: (_, task) => task.tags?.length ? (
        <Space size={[0, 4]} wrap>
          {task.tags.slice(0, 4).map(tag => <Tag key={tag} icon={<TagsOutlined />}>{tag}</Tag>)}
          {task.tags.length > 4 && <Tag>+{task.tags.length - 4}</Tag>}
        </Space>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: t('taskLibrary.tokens'),
      dataIndex: 'estimated_tokens',
      width: 120,
      render: (_, task) => task.estimated_tokens > 0 ? `~${task.estimated_tokens}` : '-',
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 170,
      render: (_, task) => [
        <Button key="view" size="small" icon={<EyeOutlined />} onClick={() => setSelectedTask(task)} />,
        <Button key="run" size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => handleRunTask(task)} />,
        !task.is_preset && (
          <Popconfirm
            key="delete"
            title={t('taskLibrary.deleteTask')}
            description={t('taskLibrary.deleteTaskConfirm')}
            okText={t('common.delete')}
            cancelText={t('common.cancel')}
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteTask(task)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ),
      ],
    },
  ]

  if (loading) {
    return (
      <PageContainer title={t('taskLibrary.title')} subTitle={t('taskLibrary.subtitle')}>
        <ProCard bordered><Spin style={{ display: 'block', margin: '64px auto' }} /></ProCard>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={t('taskLibrary.title')}
      subTitle={t('taskLibrary.subtitle')}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh}>{t('taskLibrary.refresh')}</Button>,
        <Button key="create" type="primary" icon={<PlusOutlined />} onClick={() => {
          resetCreateForm()
          setCreateOpen(true)
        }}>
          {t('taskLibrary.createTask')}
        </Button>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: t('taskLibrary.totalTasks'), value: stats.total, icon: <BookOutlined /> }} />
          <StatisticCard statistic={{ title: t('taskLibrary.presets'), value: stats.presetCount, icon: <StarOutlined /> }} />
          <StatisticCard statistic={{ title: t('taskLibrary.custom'), value: stats.customCount, icon: <PlusOutlined /> }} />
          <StatisticCard statistic={{ title: t('taskLibrary.category'), value: stats.categories, icon: <TagsOutlined /> }} />
        </StatisticCard.Group>

        <ProCard bordered>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Input.Search
              allowClear
              placeholder={t('taskLibrary.searchTasks')}
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              style={{ maxWidth: 480 }}
            />
            <Space wrap>
              {categories.map(category => (
                <Button
                  key={category.id}
                  type={selectedCategory === category.id ? 'primary' : 'default'}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.name}
                </Button>
              ))}
            </Space>
          </Space>
        </ProCard>

        <ProCard bordered title={`${t('taskLibrary.title')} (${filteredTasks.length})`}>
          {filteredTasks.length === 0 ? (
            <Empty description={searchQuery || selectedCategory !== 'all' ? t('taskLibrary.noTasksMatch') : t('taskLibrary.noTasksYet')}>
              <Space>
                {(searchQuery || selectedCategory !== 'all') && <Button onClick={() => { setSearchQuery(''); setSelectedCategory('all') }}>{t('taskLibrary.clearFilters')}</Button>}
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t('taskLibrary.createTask')}</Button>
              </Space>
            </Empty>
          ) : (
            <ProTable<AgentTask>
              rowKey="id"
              search={false}
              options={false}
              columns={columns}
              dataSource={filteredTasks}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              toolBarRender={false}
              onRow={task => ({ onClick: () => setSelectedTask(task) })}
            />
          )}
        </ProCard>
      </Space>

      <Drawer
        title={selectedTask?.name || t('taskLibrary.taskDetails')}
        open={Boolean(selectedTask)}
        width={620}
        onClose={() => setSelectedTask(null)}
        extra={selectedTask && <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => handleRunTask(selectedTask)}>{t('taskLibrary.runThisTask')}</Button>}
      >
        {selectedTask && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <ProCard bordered size="small">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space wrap>
                  <Tag color={categoryColor(selectedTask.category)}>{selectedTask.category}</Tag>
                  {selectedTask.is_preset && <Tag color="blue" icon={<StarOutlined />}>{t('taskLibrary.preset')}</Tag>}
                  {selectedTask.estimated_tokens > 0 && <Tag>~{selectedTask.estimated_tokens} {t('taskLibrary.tokens')}</Tag>}
                </Space>
                <Paragraph>{selectedTask.description}</Paragraph>
              </Space>
            </ProCard>

            {selectedTask.tags?.length > 0 && (
              <ProCard bordered size="small" title={t('taskLibrary.tags')}>
                <Space wrap>{selectedTask.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}</Space>
              </ProCard>
            )}

            <ProCard bordered size="small" title={t('taskLibrary.prompt')}>
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }} code>{selectedTask.prompt}</Typography.Paragraph>
            </ProCard>

            {selectedTask.system_prompt && (
              <ProCard bordered size="small" title={t('taskLibrary.systemPrompt')}>
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }} code>{selectedTask.system_prompt}</Typography.Paragraph>
              </ProCard>
            )}

            {selectedTask.tools_required?.length > 0 && (
              <ProCard bordered size="small" title={t('taskLibrary.requiredTools')}>
                <Space wrap>{selectedTask.tools_required.map(tool => <Tag key={tool}>{tool}</Tag>)}</Space>
              </ProCard>
            )}
          </Space>
        )}
      </Drawer>

      <Modal
        title={t('taskLibrary.createNewTask')}
        open={createOpen}
        width={760}
        confirmLoading={creating}
        onOk={handleCreateTask}
        onCancel={() => setCreateOpen(false)}
        okText={t('taskLibrary.createTask')}
        okButtonProps={{ icon: <SaveOutlined /> }}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical" initialValues={{ category: 'custom' }}>
          <Form.Item name="name" label={t('taskLibrary.taskName')} rules={[{ required: true }]}>
            <Input placeholder={t('taskLibrary.taskNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('taskLibrary.description')} rules={[{ required: true }]}>
            <Input placeholder={t('taskLibrary.descriptionPlaceholder')} />
          </Form.Item>
          <Form.Item name="category" label={t('taskLibrary.category')} rules={[{ required: true }]}>
            <Select options={categories.filter(category => category.id !== 'all').map(category => ({ label: category.name, value: category.id }))} />
          </Form.Item>
          <Form.Item name="prompt" label={t('taskLibrary.prompt')} rules={[{ required: true }]}>
            <TextArea rows={8} placeholder={t('taskLibrary.promptPlaceholder')} />
          </Form.Item>
          <Form.Item name="system_prompt" label={t('taskLibrary.systemPromptOptional')}>
            <TextArea rows={4} placeholder={t('taskLibrary.systemPromptPlaceholder')} />
          </Form.Item>
          <Form.Item name="tags" label={t('taskLibrary.tagsCommaSeparated')}>
            <Input placeholder={t('taskLibrary.tagsPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
