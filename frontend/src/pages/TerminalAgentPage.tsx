import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Space,
  Tag,
  Timeline,
  Typography,
  Upload,
} from 'antd'
import type { UploadFile } from 'antd'
import {
  ArrowRightOutlined,
  BugOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  DeleteOutlined,
  GlobalOutlined,
  LaptopOutlined,
  MessageOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  ThunderboltOutlined,
  WifiOutlined,
} from '@ant-design/icons'
import { terminalApi } from '../services/api'

const { Paragraph, Text } = Typography

interface TerminalSessionSummary {
  session_id: string
  name: string
  target: string
  template_id: string | null
  messages_count: number
  commands_count: number
  created_at: string
}

interface TerminalMessage {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  timestamp: string
  suggested_commands?: string[]
  exit_code?: number
  command?: string
  duration?: number
}

interface ExploitationStep {
  description: string
  command: string
  result: string
  step_type: 'recon' | 'exploit' | 'pivot' | 'escalate' | 'action'
  timestamp: string
}

interface TerminalSessionData {
  session_id: string
  name: string
  target: string
  template_id: string | null
  messages: TerminalMessage[]
  exploitation_path: ExploitationStep[]
  vpn_status: VpnStatus | null
  created_at: string
}

interface VpnStatus {
  connected: boolean
  ip: string | null
  interface: string | null
  latency_ms: number | null
}

interface SessionTemplate {
  id: string
  name: string
  description: string
  icon: string
  accent: string
}

interface CreateSessionValues {
  target: string
  name?: string
}

interface VpnFormValues {
  username?: string
  password?: string
}

const stepColors: Record<string, string> = {
  recon: 'blue',
  exploit: 'red',
  pivot: 'orange',
  escalate: 'purple',
  action: 'green',
}

function getTemplates(t: (key: string) => string): SessionTemplate[] {
  return [
    { id: 'network_scanner', name: t('terminal.templates.networkScanner'), description: t('terminal.templates.networkScannerDesc'), icon: 'globe', accent: 'blue' },
    { id: 'lateral_movement', name: t('terminal.templates.lateralMovement'), description: t('terminal.templates.lateralMovementDesc'), icon: 'arrows', accent: 'orange' },
    { id: 'privilege_escalation', name: t('terminal.templates.privilegeEscalation'), description: t('terminal.templates.privilegeEscalationDesc'), icon: 'shield', accent: 'red' },
    { id: 'vpn_recon', name: t('terminal.templates.vpnRecon'), description: t('terminal.templates.vpnReconDesc'), icon: 'wifi', accent: 'green' },
  ]
}

function templateIcon(icon: string) {
  if (icon === 'globe') return <GlobalOutlined />
  if (icon === 'arrows') return <ArrowRightOutlined />
  if (icon === 'shield') return <SafetyCertificateOutlined />
  if (icon === 'wifi') return <WifiOutlined />
  return <LaptopOutlined />
}

function roleMeta(role: TerminalMessage['role']) {
  if (role === 'assistant') return { color: 'blue', icon: <RobotOutlined />, label: 'AI' }
  if (role === 'tool') return { color: 'green', icon: <CodeOutlined />, label: 'Tool' }
  if (role === 'system') return { color: 'orange', icon: <ThunderboltOutlined />, label: 'System' }
  return { color: 'purple', icon: <MessageOutlined />, label: 'User' }
}

export default function TerminalAgentPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [createForm] = Form.useForm<CreateSessionValues>()
  const [vpnForm] = Form.useForm<VpnFormValues>()

  const [sessions, setSessions] = useState<TerminalSessionSummary[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [sessionData, setSessionData] = useState<TerminalSessionData | null>(null)
  const [message, setMessage] = useState('')
  const [command, setCommand] = useState('')
  const [useSandbox, setUseSandbox] = useState(true)
  const [loading, setLoading] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [executingCommand, setExecutingCommand] = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [templates, setTemplates] = useState<SessionTemplate[]>(getTemplates(t))
  const [vpnStatus, setVpnStatus] = useState<VpnStatus | null>(null)
  const [vpnFile, setVpnFile] = useState<File | null>(null)
  const [vpnUploading, setVpnUploading] = useState(false)
  const [vpnConnecting, setVpnConnecting] = useState(false)
  const [vpnError, setVpnError] = useState<string | null>(null)

  const sessionMessageCount = sessionData?.messages.length ?? 0
  const exploitationStepCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    sessionData?.exploitation_path?.forEach(step => { counts[step.step_type] = (counts[step.step_type] || 0) + 1 })
    return counts
  }, [sessionData?.exploitation_path])
  const hasExploitationSteps = (sessionData?.exploitation_path?.length ?? 0) > 0

  const loadSessions = useCallback(async () => {
    try {
      const data = await terminalApi.listSessions()
      setSessions(data.sessions || data || [])
    } catch (err) {
      console.error('Failed to load terminal sessions:', err)
    }
  }, [])

  const loadTemplates = useCallback(async () => {
    try {
      const data = await terminalApi.listTemplates()
      if (Array.isArray(data) && data.length > 0) setTemplates(data)
    } catch {
      setTemplates(getTemplates(t))
    }
  }, [t])

  const loadSession = useCallback(async (sessionId: string) => {
    setLoading(true)
    try {
      const data = await terminalApi.getSession(sessionId)
      setActiveSession(sessionId)
      setSessionData(data)
      if (data.vpn_status) setVpnStatus(data.vpn_status)
    } catch (err) {
      console.error('Failed to load session:', err)
      notification.error({ message: t('terminal.failedToLoadSession') })
    } finally {
      setLoading(false)
    }
  }, [notification, t])

  useEffect(() => {
    loadSessions()
    loadTemplates()
  }, [loadSessions, loadTemplates])

  useEffect(() => {
    if (!activeSession) return
    let cancelled = false
    const poll = async () => {
      try {
        const status = await terminalApi.getVpnStatus(activeSession)
        if (!cancelled) setVpnStatus(status)
      } catch {
        // VPN status is optional.
      }
    }
    poll()
    const interval = window.setInterval(poll, 3000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeSession])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionData?.messages])

  const refreshExploitationPath = useCallback(async () => {
    if (!activeSession) return
    try {
      const path = await terminalApi.getExploitationPath(activeSession)
      setSessionData(prev => prev ? { ...prev, exploitation_path: path.steps || path || [] } : prev)
    } catch {
      // non-critical
    }
  }, [activeSession])

  useEffect(() => {
    if (activeSession && sessionData && sessionData.messages.length > 0) refreshExploitationPath()
  }, [activeSession, refreshExploitationPath, sessionData?.messages.length])

  const createSession = useCallback(async () => {
    const values = await createForm.validateFields()
    setLoading(true)
    try {
      const result = await terminalApi.createSession(values.target.trim(), values.name?.trim() || undefined, selectedTemplate || undefined)
      await loadSessions()
      await loadSession(result.session_id)
      setShowNewSession(false)
      setSelectedTemplate(null)
      createForm.resetFields()
      notification.success({ message: t('terminal.sessionCreated') })
    } catch (err) {
      console.error('Failed to create session:', err)
      notification.error({ message: t('terminal.failedToCreateSession') })
    } finally {
      setLoading(false)
    }
  }, [createForm, loadSession, loadSessions, notification, selectedTemplate, t])

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await terminalApi.deleteSession(sessionId)
      if (activeSession === sessionId) {
        setActiveSession(null)
        setSessionData(null)
        setVpnStatus(null)
      }
      await loadSessions()
      notification.info({ message: t('terminal.sessionDeleted') })
    } catch (err) {
      console.error('Failed to delete session:', err)
      notification.error({ message: t('terminal.failedToDeleteSession') })
    }
  }, [activeSession, loadSessions, notification, t])

  const sendMessage = useCallback(async () => {
    if (!message.trim() || !activeSession || sendingMessage) return
    const content = message.trim()
    setSessionData(prev => prev ? { ...prev, messages: [...prev.messages, { role: 'user', content, timestamp: new Date().toISOString() }] } : prev)
    setMessage('')
    setSendingMessage(true)
    try {
      const result = await terminalApi.sendMessage(activeSession, content)
      setSessionData(prev => prev ? {
        ...prev,
        messages: [...prev.messages, { role: 'assistant', content: result.response, timestamp: new Date().toISOString(), suggested_commands: result.suggested_commands || [] }],
      } : prev)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setSessionData(prev => prev ? { ...prev, messages: [...prev.messages, { role: 'system', content: `Error: ${error.response?.data?.detail || error.message || t('terminal.failedToSendMessage')}`, timestamp: new Date().toISOString() }] } : prev)
      notification.error({ message: t('terminal.failedToSendMessage') })
    } finally {
      setSendingMessage(false)
    }
  }, [activeSession, message, notification, sendingMessage, t])

  const executeCommand = useCallback(async (cmd?: string) => {
    const toRun = cmd || command
    if (!toRun.trim() || !activeSession || executingCommand) return
    setSessionData(prev => prev ? { ...prev, messages: [...prev.messages, { role: 'user', content: `$ ${toRun.trim()}`, timestamp: new Date().toISOString() }] } : prev)
    if (!cmd) setCommand('')
    setExecutingCommand(true)
    try {
      const result = await terminalApi.executeCommand(activeSession, toRun.trim(), useSandbox ? 'sandbox' : 'direct')
      const output = [result.stdout || '', result.stderr ? `\n[stderr]\n${result.stderr}` : ''].filter(Boolean).join('')
      setSessionData(prev => prev ? {
        ...prev,
        messages: [...prev.messages, {
          role: 'tool',
          content: output || t('terminal.noOutput'),
          timestamp: new Date().toISOString(),
          exit_code: result.exit_code,
          command: result.command,
          duration: result.duration,
        }],
      } : prev)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setSessionData(prev => prev ? { ...prev, messages: [...prev.messages, { role: 'tool', content: error.response?.data?.detail || error.message || t('terminal.commandExecutionFailed'), timestamp: new Date().toISOString(), exit_code: -1 }] } : prev)
      notification.error({ message: t('terminal.commandExecutionFailed') })
    } finally {
      setExecutingCommand(false)
    }
  }, [activeSession, command, executingCommand, notification, t, useSandbox])

  const handleVpnUploadAndConnect = useCallback(async () => {
    if (!vpnFile || !activeSession) return
    const values = vpnForm.getFieldsValue()
    setVpnUploading(true)
    setVpnError(null)
    try {
      await terminalApi.uploadVpnConfig(activeSession, vpnFile, values.username || undefined, values.password || undefined)
      setVpnUploading(false)
      setVpnConnecting(true)
      await terminalApi.connectVpn(activeSession)
      setVpnFile(null)
      vpnForm.resetFields()
      notification.success({ message: t('terminal.vpnConnected') })
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      const errMsg = error.response?.data?.detail || error.message || t('terminal.vpnConnectionFailed')
      setVpnError(errMsg)
      notification.error({ message: errMsg })
    } finally {
      setVpnUploading(false)
      setVpnConnecting(false)
    }
  }, [activeSession, notification, t, vpnFile, vpnForm])

  const handleVpnDisconnect = useCallback(async () => {
    if (!activeSession) return
    try {
      await terminalApi.disconnectVpn(activeSession)
      notification.info({ message: t('terminal.vpnDisconnected') })
    } catch {
      notification.error({ message: t('terminal.failedToDisconnectVpn') })
    }
  }, [activeSession, notification, t])

  const renderMessage = useCallback((msg: TerminalMessage, index: number) => {
    const meta = roleMeta(msg.role)
    return (
      <List.Item key={`${msg.timestamp}-${index}`} style={{ justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
        <Card size="small" style={{ maxWidth: msg.role === 'tool' ? '92%' : '84%', width: msg.role === 'tool' ? '92%' : undefined, background: msg.role === 'tool' ? '#0f172a' : undefined }}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space wrap>
              <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>
              {msg.command && <Text code>{msg.command}</Text>}
              {typeof msg.exit_code === 'number' && <Tag color={msg.exit_code === 0 ? 'green' : 'red'}>exit {msg.exit_code}</Tag>}
              {typeof msg.duration === 'number' && <Tag>{msg.duration < 1 ? '<1s' : `${msg.duration.toFixed(1)}s`}</Tag>}
              <Text type="secondary">{new Date(msg.timestamp).toLocaleTimeString()}</Text>
            </Space>
            {msg.role === 'tool' ? (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' }}>{msg.content}</pre>
            ) : (
              <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</Paragraph>
            )}
            {msg.suggested_commands?.length ? (
              <Space wrap>
                {msg.suggested_commands.map(suggested => (
                  <Button key={suggested} size="small" icon={<CodeOutlined />} loading={executingCommand} onClick={() => executeCommand(suggested)}>{suggested}</Button>
                ))}
              </Space>
            ) : null}
          </Space>
        </Card>
      </List.Item>
    )
  }, [executeCommand, executingCommand])

  const sessionStats = (
    <StatisticCard.Group direction="row">
      <StatisticCard statistic={{ title: t('terminal.sessions'), value: sessions.length, icon: <MessageOutlined /> }} />
      <StatisticCard statistic={{ title: t('terminal.messages'), value: sessionMessageCount, icon: <RobotOutlined /> }} />
      <StatisticCard statistic={{ title: t('terminal.commands'), value: sessionData?.messages.filter(item => item.role === 'tool').length || 0, icon: <CodeOutlined /> }} />
      <StatisticCard statistic={{ title: t('terminal.vpnConnection'), value: vpnStatus?.connected ? t('terminal.connected') : t('terminal.notConnected'), icon: <Badge status={vpnStatus?.connected ? 'success' : 'default'} /> }} />
    </StatisticCard.Group>
  )

  return (
    <PageContainer
      title={<Space><LaptopOutlined />{t('terminal.title')}</Space>}
      subTitle={t('terminal.description')}
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setShowNewSession(true)}>{t('terminal.newSession')}</Button>}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {sessionStats}
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={6}>
            <ProCard bordered title={t('terminal.sessions')} extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setShowNewSession(true)} />}>
              <List
                loading={loading && !sessionData}
                dataSource={sessions}
                locale={{ emptyText: <Empty description={t('terminal.noSessions')} /> }}
                renderItem={session => (
                  <List.Item
                    style={{ cursor: 'pointer', background: activeSession === session.session_id ? '#e6f4ff' : undefined, padding: 12, borderRadius: 8 }}
                    onClick={() => loadSession(session.session_id)}
                    actions={[
                      <Popconfirm key="delete" title={t('terminal.deleteConfirm')} onConfirm={event => { event?.stopPropagation(); deleteSession(session.session_id) }}>
                        <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={event => event.stopPropagation()} />
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={templateIcon(session.template_id || '')}
                      title={<Text strong ellipsis>{session.name || session.target}</Text>}
                      description={(
                        <Space direction="vertical" size={2}>
                          <Text type="secondary" ellipsis>{session.target}</Text>
                          <Space size="small"><Tag>{session.messages_count} msg</Tag><Tag>{session.commands_count} cmd</Tag>{session.template_id && <Tag>{session.template_id.replace(/_/g, ' ')}</Tag>}</Space>
                        </Space>
                      )}
                    />
                  </List.Item>
                )}
              />
            </ProCard>
          </Col>

          <Col xs={24} xl={12}>
            <ProCard
              bordered
              title={sessionData ? <Space><LaptopOutlined />{sessionData.name || t('terminal.terminalSession')}</Space> : t('terminal.terminalSession')}
              subTitle={sessionData?.target}
              bodyStyle={{ padding: 0 }}
            >
              {activeSession && sessionData ? (
                <Space direction="vertical" style={{ width: '100%' }} size={0}>
                  <div style={{ height: 560, overflow: 'auto', padding: 16, background: '#f8fafc' }}>
                    {sessionData.messages.length ? <List dataSource={sessionData.messages} renderItem={renderMessage} /> : <Empty description={t('terminal.sessionReadyDesc')} />}
                    {(sendingMessage || executingCommand) && <Alert style={{ marginTop: 12 }} type="info" showIcon message={sendingMessage ? t('terminal.agentThinking') : t('terminal.executingCommand')} />}
                    <div ref={messagesEndRef} />
                  </div>
                  <div style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Input.Search
                        value={message}
                        onChange={event => setMessage(event.target.value)}
                        placeholder={t('terminal.askAgentPlaceholder')}
                        enterButton={<Button type="primary" icon={<SendOutlined />} loading={sendingMessage}>{t('agent.send')}</Button>}
                        disabled={sendingMessage || executingCommand}
                        onSearch={sendMessage}
                      />
                      <Space.Compact style={{ width: '100%' }}>
                        <Input value={command} onChange={event => setCommand(event.target.value)} placeholder={t('terminal.enterCommandPlaceholder')} prefix={<Text code>$</Text>} disabled={sendingMessage || executingCommand} onPressEnter={() => executeCommand()} />
                        <Button icon={<CodeOutlined />} loading={executingCommand} disabled={!command.trim() || sendingMessage} onClick={() => executeCommand()}>{t('terminal.executeCommands')}</Button>
                        <Segmented value={useSandbox ? 'sandbox' : 'direct'} options={[{ label: t('terminal.sandbox'), value: 'sandbox' }, { label: t('terminal.direct'), value: 'direct' }]} onChange={value => setUseSandbox(value === 'sandbox')} />
                      </Space.Compact>
                    </Space>
                  </div>
                </Space>
              ) : (
                <Empty style={{ padding: 80 }} image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('terminal.description')}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowNewSession(true)}>{t('terminal.newSession')}</Button>
                </Empty>
              )}
            </ProCard>
          </Col>

          <Col xs={24} xl={6}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <ProCard bordered title={<Space><WifiOutlined />{t('terminal.vpnConnection')}</Space>}>
                {vpnStatus?.connected ? (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Alert type="success" showIcon message={t('terminal.connected')} description={[vpnStatus.ip, vpnStatus.interface, vpnStatus.latency_ms != null ? `${vpnStatus.latency_ms}ms ${t('terminal.latency')}` : null].filter(Boolean).join(' · ')} />
                    <Button danger block onClick={handleVpnDisconnect}>{t('terminal.disconnect')}</Button>
                  </Space>
                ) : activeSession ? (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Alert type="info" showIcon message={t('terminal.notConnected')} />
                    <Upload beforeUpload={file => { setVpnFile(file); return false }} fileList={vpnFile ? [{ uid: vpnFile.name, name: vpnFile.name, status: 'done' } as UploadFile] : []} onRemove={() => setVpnFile(null)} accept=".ovpn,.conf" maxCount={1}>
                      <Button block icon={<CloudUploadOutlined />}>{vpnFile ? vpnFile.name : t('terminal.selectOvpnFile')}</Button>
                    </Upload>
                    <Form form={vpnForm} layout="vertical">
                      <Form.Item name="username" label={t('terminal.vpnUsername')}><Input /></Form.Item>
                      <Form.Item name="password" label={t('terminal.vpnPassword')}><Input.Password /></Form.Item>
                    </Form>
                    {vpnError && <Alert type="error" showIcon message={vpnError} />}
                    <Button type="primary" block icon={<WifiOutlined />} loading={vpnUploading || vpnConnecting} disabled={!vpnFile} onClick={handleVpnUploadAndConnect}>{vpnUploading ? t('terminal.uploading') : vpnConnecting ? t('terminal.connecting') : t('terminal.connectVpn')}</Button>
                  </Space>
                ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('terminal.noSession')} />}
              </ProCard>

              <ProCard bordered title={<Space><BugOutlined />{t('terminal.exploitationPath')}</Space>} subTitle={hasExploitationSteps ? `${sessionData?.exploitation_path.length} ${t('terminal.steps')}` : undefined}>
                {hasExploitationSteps && sessionData ? (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Timeline
                      items={sessionData.exploitation_path.map(step => ({
                        color: stepColors[step.step_type] || 'gray',
                        children: (
                          <Space direction="vertical" size={2}>
                            <Tag color={stepColors[step.step_type] || 'default'}>{step.step_type}</Tag>
                            <Text>{step.description}</Text>
                            {step.command && <Text code>$ {step.command}</Text>}
                            {step.result && <Text type="secondary" ellipsis>{step.result}</Text>}
                            <Text type="secondary">{new Date(step.timestamp).toLocaleTimeString()}</Text>
                          </Space>
                        ),
                      }))}
                    />
                    <Space wrap>{Object.entries(stepColors).map(([type, color]) => <Tag key={type} color={color}>{type}{exploitationStepCounts[type] ? ` (${exploitationStepCounts[type]})` : ''}</Tag>)}</Space>
                  </Space>
                ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={activeSession ? t('terminal.noExploitationSteps') : t('terminal.selectSessionToView')} />}
              </ProCard>
            </Space>
          </Col>
        </Row>
      </Space>

      <Modal
        title={<Space><LaptopOutlined />{t('terminal.newTerminalSession')}</Space>}
        open={showNewSession}
        confirmLoading={loading}
        okText={t('terminal.createSession')}
        cancelText={t('common.cancel')}
        onOk={createSession}
        onCancel={() => { setShowNewSession(false); setSelectedTemplate(null); createForm.resetFields() }}
        width={760}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>{t('terminal.sessionTemplate')}</Text>
            <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
              {templates.map(template => (
                <Col key={template.id} xs={24} sm={12}>
                  <Card hoverable size="small" onClick={() => setSelectedTemplate(selectedTemplate === template.id ? null : template.id)} style={{ borderColor: selectedTemplate === template.id ? '#1677ff' : undefined }}>
                    <Space align="start">
                      {templateIcon(template.icon)}
                      <Space direction="vertical" size={2}>
                        <Text strong>{template.name}</Text>
                        <Text type="secondary">{template.description}</Text>
                      </Space>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
          <Form form={createForm} layout="vertical" requiredMark={false}>
            <Form.Item name="target" label={t('terminal.target')} rules={[{ required: true, message: t('terminal.targetPlaceholder') }]}>
              <Input placeholder={t('terminal.targetPlaceholder')} autoFocus />
            </Form.Item>
            <Form.Item name="name" label={t('terminal.sessionName')}>
              <Input placeholder={t('terminal.sessionNamePlaceholder')} />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </PageContainer>
  )
}
