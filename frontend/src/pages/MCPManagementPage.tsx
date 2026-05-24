import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  ToolOutlined,
  WifiOutlined,
} from '@ant-design/icons'
import { mcpApi } from '../services/api'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface MCPServer {
  name: string
  transport: 'stdio' | 'sse'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  description?: string
  enabled: boolean
  is_builtin: boolean
  tool_count: number
}

interface MCPTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

interface TestResult {
  success: boolean
  message: string
}

interface ServerFormValues {
  name: string
  transport: 'stdio' | 'sse'
  command?: string
  args?: string
  url?: string
  env?: string
  description?: string
}

function getToolParams(schema: Record<string, unknown>): string[] {
  if (!schema || typeof schema !== 'object') return []
  const props = schema.properties
  if (!props || typeof props !== 'object') return []
  return Object.keys(props as Record<string, unknown>)
}

function parseEnvVars(raw?: string): Record<string, string> | undefined {
  const lines = (raw || '').split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length === 0) return undefined
  const env: Record<string, string> = {}
  for (const line of lines) {
    const idx = line.indexOf('=')
    if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return Object.keys(env).length > 0 ? env : undefined
}

function formatEnvVars(env?: Record<string, string>) {
  return env ? Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') : ''
}

export default function MCPManagementPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null)
  const [testingServer, setTestingServer] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [expandedServer, setExpandedServer] = useState<string | null>(null)
  const [serverTools, setServerTools] = useState<Record<string, MCPTool[]>>({})
  const [loadingTools, setLoadingTools] = useState<string | null>(null)
  const [form] = Form.useForm<ServerFormValues>()
  const transport = Form.useWatch('transport', form) || 'stdio'

  const enabledCount = useMemo(() => servers.filter(server => server.enabled).length, [servers])
  const totalTools = useMemo(() => servers.reduce((sum, server) => sum + server.tool_count, 0), [servers])

  const fetchServers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await mcpApi.listServers()
      setServers(data.servers ?? [])
    } catch (error) {
      console.error('Failed to fetch MCP servers:', error)
      notification.error({ message: t('mcp.failedToFetch', 'Failed to fetch MCP servers') })
    } finally {
      setLoading(false)
    }
  }, [notification, t])

  useEffect(() => {
    fetchServers()
  }, [fetchServers])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchServers()
    } finally {
      setRefreshing(false)
    }
  }, [fetchServers])

  const openAddModal = () => {
    setEditingServer(null)
    form.resetFields()
    form.setFieldsValue({ transport: 'stdio' })
    setModalOpen(true)
  }

  const openEditModal = (server: MCPServer) => {
    setEditingServer(server)
    form.setFieldsValue({
      name: server.name,
      transport: server.transport,
      command: server.command || '',
      args: server.args?.join(' ') || '',
      url: server.url || '',
      env: formatEnvVars(server.env),
      description: server.description || '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    const body: Record<string, unknown> = {
      name: values.name.trim(),
      transport: values.transport,
      description: values.description?.trim() || undefined,
      env: parseEnvVars(values.env),
    }
    if (values.transport === 'stdio') {
      body.command = values.command?.trim()
      body.args = values.args?.trim() ? values.args.trim().split(/\s+/) : undefined
    } else {
      body.url = values.url?.trim()
    }

    try {
      if (editingServer) {
        await mcpApi.updateServer(editingServer.name, body)
      } else {
        await mcpApi.createServer(body as { name: string; transport: string; command?: string; args?: string[]; url?: string; env?: Record<string, string>; description?: string })
      }
      notification.success({ message: t('mcp.serverSaved', { name: values.name, action: editingServer ? t('mcp.updated') : t('mcp.created') }) })
      setModalOpen(false)
      setEditingServer(null)
      await fetchServers()
    } catch (error: any) {
      notification.error({ message: error.response?.data?.detail || t('mcp.failedToSave', { action: editingServer ? t('mcp.update') : t('mcp.create') }) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (server: MCPServer) => {
    try {
      await mcpApi.deleteServer(server.name)
      notification.success({ message: t('mcp.serverDeleted', { name: server.name }) })
      if (expandedServer === server.name) setExpandedServer(null)
      await fetchServers()
    } catch (error: any) {
      notification.error({ message: error.response?.data?.detail || t('mcp.failedToDelete', { name: server.name }) })
    }
  }

  const handleToggle = async (server: MCPServer) => {
    try {
      await mcpApi.toggleServer(server.name)
      await fetchServers()
    } catch {
      notification.error({ message: t('mcp.failedToToggle', { name: server.name }) })
    }
  }

  const handleTest = async (server: MCPServer) => {
    setTestingServer(server.name)
    setTestResults(prev => {
      const next = { ...prev }
      delete next[server.name]
      return next
    })
    try {
      const data: TestResult = await mcpApi.testServer(server.name)
      setTestResults(prev => ({ ...prev, [server.name]: data }))
      notification[data.success ? 'success' : 'error']({
        message: data.success ? t('mcp.testSuccess', { name: server.name }) : t('mcp.testFailed', { name: server.name, message: data.message }),
      })
    } catch {
      const result = { success: false, message: t('errors.networkError') }
      setTestResults(prev => ({ ...prev, [server.name]: result }))
      notification.error({ message: t('mcp.networkError', { name: server.name }) })
    } finally {
      setTestingServer(null)
    }
  }

  const toggleToolBrowser = async (server: MCPServer) => {
    if (expandedServer === server.name) {
      setExpandedServer(null)
      return
    }
    setExpandedServer(server.name)
    if (serverTools[server.name]) return
    setLoadingTools(server.name)
    try {
      const data = await mcpApi.listTools(server.name)
      setServerTools(prev => ({ ...prev, [server.name]: data.tools ?? [] }))
    } catch (error) {
      console.error('Failed to fetch tools for', server.name, error)
      notification.error({ message: t('mcp.failedToLoadTools', 'Failed to load tools') })
    } finally {
      setLoadingTools(null)
    }
  }

  const expandedRowRender = (server: MCPServer) => {
    if (expandedServer !== server.name) return null
    if (loadingTools === server.name) return <Spin style={{ display: 'block', margin: '24px auto' }} />
    const tools = serverTools[server.name] || []
    if (tools.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('mcp.noToolsAvailable')} />
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {tools.map(tool => (
          <ProCard key={tool.name} bordered size="small" title={<Space><ToolOutlined />{tool.name}</Space>}>
            {tool.description && <Paragraph type="secondary">{tool.description}</Paragraph>}
            {getToolParams(tool.input_schema).length > 0 && (
              <Space wrap>{getToolParams(tool.input_schema).map(param => <Tag key={param}>{param}</Tag>)}</Space>
            )}
          </ProCard>
        ))}
      </Space>
    )
  }

  const columns: ProColumns<MCPServer>[] = [
    {
      title: t('mcp.configuredServers'),
      dataIndex: 'name',
      render: (_, server) => (
        <Space direction="vertical" size={2}>
          <Space wrap>
            <Text strong>{server.name}</Text>
            <Tag color={server.transport === 'stdio' ? 'blue' : 'purple'} icon={server.transport === 'stdio' ? <CodeOutlined /> : <WifiOutlined />}>{server.transport}</Tag>
            {server.is_builtin && <Tag color="gold">{t('mcp.builtin')}</Tag>}
            <Tag color={server.enabled ? 'green' : 'default'}>{server.enabled ? t('common.enabled') : t('common.disabled')}</Tag>
          </Space>
          {server.description && <Text type="secondary">{server.description}</Text>}
          {server.transport === 'stdio' && server.command && <Text code>{server.command}{server.args?.length ? ` ${server.args.join(' ')}` : ''}</Text>}
          {server.transport === 'sse' && server.url && <Text code>{server.url}</Text>}
          {server.env && Object.keys(server.env).length > 0 && <Space wrap>{Object.keys(server.env).map(key => <Tag key={key}>{key}</Tag>)}</Space>}
          {testResults[server.name] && <Alert type={testResults[server.name].success ? 'success' : 'error'} showIcon message={testResults[server.name].message} />}
        </Space>
      ),
    },
    {
      title: t('mcp.totalTools'),
      dataIndex: 'tool_count',
      width: 120,
    },
    {
      title: t('common.enabled'),
      dataIndex: 'enabled',
      width: 110,
      render: (_, server) => <Switch checked={server.enabled} onChange={() => handleToggle(server)} />,
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 240,
      render: (_, server) => [
        <Button key="tools" size="small" icon={<ToolOutlined />} onClick={() => toggleToolBrowser(server)}>{t('mcp.browseTools')}</Button>,
        <Button key="test" size="small" icon={<ApiOutlined />} loading={testingServer === server.name} onClick={() => handleTest(server)}>{t('mcp.testConnection')}</Button>,
        <Button key="edit" size="small" icon={<EditOutlined />} onClick={() => openEditModal(server)} />,
        <Popconfirm
          key="delete"
          title={t('mcp.deleteServer')}
          description={t('mcp.deleteServerConfirm', { name: server.name })}
          okText={t('common.delete')}
          cancelText={t('common.cancel')}
          okButtonProps={{ danger: true }}
          disabled={server.is_builtin}
          onConfirm={() => handleDelete(server)}
        >
          <Button size="small" danger disabled={server.is_builtin} icon={<DeleteOutlined />} />
        </Popconfirm>,
      ],
    },
  ]

  return (
    <PageContainer
      title={t('mcp.title')}
      subTitle={t('mcp.subtitle')}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh}>{t('common.refresh')}</Button>,
        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openAddModal}>{t('mcp.addServer')}</Button>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: t('mcp.totalServers'), value: servers.length, icon: <ApiOutlined /> }} />
          <StatisticCard statistic={{ title: t('common.enabled'), value: enabledCount, icon: <CheckCircleOutlined /> }} />
          <StatisticCard statistic={{ title: t('mcp.totalTools'), value: totalTools, icon: <ToolOutlined /> }} />
        </StatisticCard.Group>

        <ProCard bordered title={`${t('mcp.configuredServers')} (${servers.length})`}>
          {loading ? (
            <Spin style={{ display: 'block', margin: '48px auto' }} />
          ) : servers.length === 0 ? (
            <Empty description={t('mcp.noServers')}>
              <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>{t('mcp.addFirstServer')}</Button>
            </Empty>
          ) : (
            <ProTable<MCPServer>
              rowKey="name"
              search={false}
              options={false}
              columns={columns}
              dataSource={servers}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              toolBarRender={false}
              expandable={{
                expandedRowKeys: expandedServer ? [expandedServer] : [],
                expandedRowRender,
                expandIcon: () => null,
              }}
            />
          )}
        </ProCard>
      </Space>

      <Modal
        title={editingServer ? t('mcp.editServer') : t('mcp.addServer')}
        open={modalOpen}
        width={720}
        confirmLoading={saving}
        onOk={handleSave}
        onCancel={() => {
          setModalOpen(false)
          setEditingServer(null)
        }}
        okText={editingServer ? t('mcp.updateServer') : t('mcp.addServer')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical" initialValues={{ transport: 'stdio' }}>
          <Form.Item name="name" label={t('mcp.serverName')} rules={[{ required: true, message: t('mcp.serverNameRequired') }]}>
            <Input placeholder="my-mcp-server" disabled={Boolean(editingServer)} />
          </Form.Item>
          <Form.Item name="transport" label={t('mcp.transport')} rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" options={[{ label: 'stdio', value: 'stdio' }, { label: 'sse', value: 'sse' }]} />
          </Form.Item>
          {transport === 'stdio' ? (
            <>
              <Form.Item name="command" label={t('mcp.command')} rules={[{ required: true, message: t('mcp.commandRequired') }]}>
                <Input placeholder="npx" />
              </Form.Item>
              <Form.Item name="args" label={t('mcp.arguments')}>
                <Input placeholder="-y @modelcontextprotocol/server-filesystem /tmp" />
              </Form.Item>
            </>
          ) : (
            <Form.Item name="url" label={t('mcp.serverUrl')} rules={[{ required: true, message: t('mcp.urlRequired') }]}>
              <Input placeholder="http://localhost:3001/sse" />
            </Form.Item>
          )}
          <Form.Item name="env" label={t('mcp.environmentVariables')} extra={t('mcp.envHelper')}>
            <TextArea rows={4} placeholder={'API_KEY=your-key-here\nANOTHER_VAR=value'} />
          </Form.Item>
          <Form.Item name="description" label={t('mcp.description')}>
            <Input placeholder={t('mcp.descriptionPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
