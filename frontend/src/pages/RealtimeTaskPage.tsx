import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  BugOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
  GlobalOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SendOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { agentApi } from '../services/api'
import type { RealtimeFinding, RealtimeMessage, RealtimeSession, RealtimeSessionSummary } from '../types'

const { Paragraph, Text } = Typography
const MESSAGE_MAX_LENGTH = 600
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

const getQuickPrompts = (t: any) => [
  { label: t('realtimeTask.securityHeaders'), prompt: 'Analyze security headers and identify misconfigurations', icon: <SafetyCertificateOutlined /> },
  { label: t('realtimeTask.fullScan'), prompt: 'Perform a comprehensive security assessment including headers, cookies, CORS, and endpoint discovery', icon: <SearchOutlined /> },
  { label: t('realtimeTask.xssTest'), prompt: 'Test for Cross-Site Scripting (XSS) vulnerabilities in all input fields', icon: <ThunderboltOutlined /> },
  { label: t('realtimeTask.sqlInjection'), prompt: 'Check for SQL injection vulnerabilities in parameters and forms', icon: <CodeOutlined /> },
  { label: t('realtimeTask.directoryEnum'), prompt: 'Discover hidden directories, files, and endpoints using common wordlists', icon: <GlobalOutlined /> },
  { label: t('realtimeTask.techStack'), prompt: 'Detect technologies, frameworks, and versions used by this application', icon: <ApiOutlined /> },
]

const getToolPrompts = (t: any) => [
  { tool: 'ffuf', label: 'FFUF', description: t('realtimeTask.ffuf'), icon: <ThunderboltOutlined /> },
  { tool: 'feroxbuster', label: 'Feroxbuster', description: t('realtimeTask.feroxbuster'), icon: <SearchOutlined /> },
  { tool: 'nuclei', label: 'Nuclei', description: t('realtimeTask.nuclei'), icon: <BugOutlined /> },
  { tool: 'nmap', label: 'Nmap', description: t('realtimeTask.nmap'), icon: <GlobalOutlined /> },
  { tool: 'nikto', label: 'Nikto', description: t('realtimeTask.nikto'), icon: <SafetyCertificateOutlined /> },
  { tool: 'httpx', label: 'HTTPX', description: t('realtimeTask.httpx'), icon: <ApiOutlined /> },
]

function severityColor(severity: string) {
  const colors: Record<string, string> = {
    critical: 'red',
    high: 'volcano',
    medium: 'orange',
    low: 'blue',
    info: 'default',
  }
  return colors[severity] || 'default'
}

function truncateContent(content: string, expanded: boolean) {
  if (expanded || content.length <= MESSAGE_MAX_LENGTH) return content
  return `${content.slice(0, MESSAGE_MAX_LENGTH)}...`
}

export default function RealtimeTaskPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [sessions, setSessions] = useState<RealtimeSessionSummary[]>([])
  const [activeSession, setActiveSession] = useState<RealtimeSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showNewSession, setShowNewSession] = useState(false)
  const [newTarget, setNewTarget] = useState('')
  const [newSessionName, setNewSessionName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set())
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set())
  const [llmStatus, setLlmStatus] = useState<{ available: boolean; provider: string | null; error: string | null } | null>(null)
  const [showToolsModal, setShowToolsModal] = useState(false)
  const [toolsStatus, setToolsStatus] = useState<{ available: boolean; docker_status: string } | null>(null)
  const [executingTool, setExecutingTool] = useState<string | null>(null)
  const [generatingReport, setGeneratingReport] = useState(false)

  const loadSessions = useCallback(async () => {
    try {
      const data = await agentApi.realtime.listSessions()
      setSessions(data.sessions || [])
    } catch (err) {
      console.error('Failed to load sessions:', err)
    }
  }, [])

  const loadSession = useCallback(async (sessionId: string) => {
    setError(null)
    try {
      const data = await agentApi.realtime.getSession(sessionId)
      setActiveSession(data)
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string } } }
      setError(errObj.response?.data?.detail || t('realtimeTask.failedToLoadSession'))
    }
  }, [t])

  const checkLlmStatus = useCallback(async () => {
    try {
      const status = await agentApi.realtime.getLlmStatus()
      setLlmStatus({ available: status.available, provider: status.provider, error: status.error })
    } catch (err) {
      console.error('Failed to check LLM status:', err)
      setLlmStatus({ available: false, provider: null, error: t('realtimeTask.failedToConnectBackend') })
    }
  }, [t])

  const loadToolsInfo = useCallback(async () => {
    try {
      setToolsStatus(await agentApi.realtime.getToolsStatus())
    } catch (err) {
      console.error('Failed to load tools info:', err)
    }
  }, [])

  useEffect(() => {
    loadSessions()
    checkLlmStatus()
    loadToolsInfo()
  }, [loadSessions, checkLlmStatus, loadToolsInfo])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeSession?.messages])

  const createSession = useCallback(async () => {
    if (!newTarget.trim()) return
    setIsCreating(true)
    setError(null)
    try {
      const result = await agentApi.realtime.createSession(newTarget, newSessionName || undefined)
      await loadSessions()
      await loadSession(result.session_id)
      setShowNewSession(false)
      setNewTarget('')
      setNewSessionName('')
      notification.success({ message: t('realtimeTask.sessionCreated') })
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string } } }
      const msg = errObj.response?.data?.detail || t('realtimeTask.failedToCreateSession')
      setError(msg)
      notification.error({ message: msg })
    } finally {
      setIsCreating(false)
    }
  }, [newTarget, newSessionName, loadSessions, loadSession, notification, t])

  const sendMessage = useCallback(async (prompt?: string) => {
    const messageToSend = prompt || message
    if (!messageToSend.trim() || !activeSession) return

    setIsSending(true)
    setMessage('')
    const userMessage: RealtimeMessage = { role: 'user', content: messageToSend, timestamp: new Date().toISOString() }
    setActiveSession(prev => prev ? { ...prev, messages: [...prev.messages, userMessage] } : null)

    try {
      const result = await agentApi.realtime.sendMessage(activeSession.session_id, messageToSend)
      const assistantMessage: RealtimeMessage = {
        role: 'assistant',
        content: result.response,
        timestamp: new Date().toISOString(),
        metadata: { tests_executed: result.tests_executed },
      }
      setActiveSession(prev => prev ? {
        ...prev,
        messages: [...prev.messages, assistantMessage],
        findings: result.findings || prev.findings,
      } : null)
      if (result.findings && result.findings.length > (activeSession.findings?.length || 0)) {
        notification.info({ message: t('realtimeTask.newFindingsDiscovered') })
      }
      inputRef.current?.focus()
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string } }; message?: string }
      const errMsg = errObj.response?.data?.detail || errObj.message || t('realtimeTask.failedToSendMessage')
      const errorMessage: RealtimeMessage = {
        role: 'assistant',
        content: `Error: ${errMsg}`,
        timestamp: new Date().toISOString(),
        metadata: { error: true },
      }
      setActiveSession(prev => prev ? { ...prev, messages: [...prev.messages, errorMessage] } : null)
      notification.error({ message: errMsg })
    } finally {
      setIsSending(false)
    }
  }, [message, activeSession, notification, t])

  const executeTool = useCallback(async (toolId: string) => {
    if (!activeSession) return
    setExecutingTool(toolId)
    setShowToolsModal(false)
    setActiveSession(prev => prev ? {
      ...prev,
      messages: [...prev.messages, { role: 'user', content: `Execute ${toolId} scan on target`, timestamp: new Date().toISOString() }],
    } : null)
    notification.info({ message: t('realtimeTask.runningTool', { tool: toolId }) })

    try {
      await agentApi.realtime.executeTool(activeSession.session_id, toolId)
      await loadSession(activeSession.session_id)
      notification.success({ message: t('realtimeTask.toolCompleted', { tool: toolId }) })
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string } }; message?: string }
      const errMsg = errObj.response?.data?.detail || errObj.message || t('realtimeTask.toolExecutionFailed')
      setActiveSession(prev => prev ? {
        ...prev,
        messages: [...prev.messages, { role: 'assistant', content: `Tool execution failed: ${errMsg}`, timestamp: new Date().toISOString(), metadata: { error: true } }],
      } : null)
      notification.error({ message: errMsg })
    } finally {
      setExecutingTool(null)
    }
  }, [activeSession, loadSession, notification, t])

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await agentApi.realtime.deleteSession(sessionId)
      if (activeSession?.session_id === sessionId) setActiveSession(null)
      await loadSessions()
      notification.success({ message: t('realtimeTask.sessionDeleted') })
    } catch (err) {
      console.error('Failed to delete session:', err)
      notification.error({ message: t('realtimeTask.failedToDeleteSession') })
    }
  }, [activeSession, loadSessions, notification, t])

  const downloadReportHtml = useCallback(async () => {
    if (!activeSession) return
    setGeneratingReport(true)
    try {
      const htmlContent = await agentApi.realtime.getReportHtml(activeSession.session_id)
      const newWindow = window.open('', '_blank')
      if (newWindow) {
        newWindow.document.write(htmlContent)
        newWindow.document.close()
      }
      notification.success({ message: t('realtimeTask.htmlReportGenerated') })
    } catch (err) {
      console.error('Failed to generate HTML report:', err)
      notification.error({ message: t('realtimeTask.failedToGenerateHtmlReport') })
    } finally {
      setGeneratingReport(false)
    }
  }, [activeSession, notification, t])

  const downloadReportJson = useCallback(async () => {
    if (!activeSession) return
    try {
      const report = await agentApi.realtime.getReport(activeSession.session_id)
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${activeSession.session_id}-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      notification.success({ message: t('realtimeTask.jsonReportDownloaded') })
    } catch (err) {
      console.error('Failed to generate report:', err)
      notification.error({ message: t('realtimeTask.failedToGenerateJsonReport') })
    }
  }, [activeSession, notification, t])

  const toggleFinding = useCallback((index: number) => {
    setExpandedFindings(prev => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })
  }, [])

  const toggleMessage = useCallback((index: number) => {
    setExpandedMessages(prev => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })
  }, [])

  const sortedFindings = useMemo(() => {
    if (!activeSession?.findings) return []
    return [...activeSession.findings].sort((a, b) => (SEVERITY_ORDER[a.severity] || 4) - (SEVERITY_ORDER[b.severity] || 4))
  }, [activeSession?.findings])

  const severityStats = useMemo(() => sortedFindings.reduce((acc, finding) => {
    const severity = finding.severity?.toLowerCase() || 'info'
    acc[severity] = (acc[severity] || 0) + 1
    return acc
  }, {} as Record<string, number>), [sortedFindings])

  const reportMenu = {
    items: [
      { key: 'html', icon: <FileTextOutlined />, label: t('realtimeTask.openHtmlReport') },
      { key: 'json', icon: <DownloadOutlined />, label: t('realtimeTask.downloadJson') },
    ],
    onClick: ({ key }: { key: string }) => key === 'html' ? downloadReportHtml() : downloadReportJson(),
  }

  const renderMessage = (msg: RealtimeMessage, index: number) => {
    const isUser = msg.role === 'user'
    const isError = msg.metadata?.error || msg.metadata?.api_error
    const isExpanded = expandedMessages.has(index)
    const shouldToggle = !isUser && msg.content.length > MESSAGE_MAX_LENGTH
    return (
      <div key={index} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
        <Card size="small" style={{ maxWidth: '86%', background: isUser ? '#e6f4ff' : isError ? '#fff2f0' : undefined }}>
          {!isUser && (
            <Space size="small" style={{ marginBottom: 8 }} wrap>
              <RobotOutlined />
              <Text type="secondary">{msg.metadata?.tool_execution ? t('realtimeTask.toolExecution') : t('realtimeTask.aiResponse')}</Text>
              {msg.metadata?.tests_executed && <Tag color="green">{t('realtimeTask.testsExecuted')}</Tag>}
              {msg.metadata?.new_findings && msg.metadata.new_findings > 0 && <Tag color="orange">+{msg.metadata.new_findings} {t('realtimeTask.findings')}</Tag>}
            </Space>
          )}
          <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>{truncateContent(msg.content, isExpanded)}</Paragraph>
          {shouldToggle && <Button type="link" size="small" onClick={() => toggleMessage(index)}>{isExpanded ? t('realtimeTask.showLess') : t('realtimeTask.showMore', { count: msg.content.length - MESSAGE_MAX_LENGTH })}</Button>}
          <Text type="secondary" style={{ fontSize: 12 }}>{new Date(msg.timestamp).toLocaleTimeString()}</Text>
        </Card>
      </div>
    )
  }

  const renderFinding = (finding: RealtimeFinding, index: number) => {
    const expanded = expandedFindings.has(index)
    return (
      <ProCard key={`${finding.title}-${index}`} bordered size="small" style={{ marginBottom: 8 }} onClick={() => toggleFinding(index)}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space direction="vertical" size={2}>
              <Text strong>{finding.title}</Text>
              <Text type="secondary" ellipsis style={{ maxWidth: 260 }}>{finding.affected_endpoint}</Text>
            </Space>
            <Space wrap>
              {finding.cvss_score && <Tag color={finding.cvss_score >= 7 ? 'red' : 'orange'}>{finding.cvss_score}</Tag>}
              <Tag color={severityColor(finding.severity)}>{finding.severity}</Tag>
            </Space>
          </Space>
          {expanded && (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {(finding.cwe_id || finding.owasp) && <Space wrap>{finding.cwe_id && <Tag color="blue">{finding.cwe_id}</Tag>}{finding.owasp && <Tag color="gold">{finding.owasp}</Tag>}</Space>}
              <Text type="secondary">{t('realtimeTask.type')}: {finding.vulnerability_type}</Text>
              <Paragraph>{finding.description}</Paragraph>
              {finding.evidence && <Paragraph code style={{ whiteSpace: 'pre-wrap' }}>{finding.evidence}</Paragraph>}
              <Paragraph type="success">{finding.remediation}</Paragraph>
            </Space>
          )}
        </Space>
      </ProCard>
    )
  }

  return (
    <PageContainer
      title={t('realtimeTask.title')}
      subTitle={t('realtimeTask.subtitle')}
      extra={[
        llmStatus && <Tag key="llm" color={llmStatus.available ? 'green' : 'red'}>{llmStatus.available ? llmStatus.provider?.toUpperCase() : t('realtimeTask.noAi')}</Tag>,
        toolsStatus && <Tag key="tools" color={toolsStatus.available ? 'blue' : 'default'} icon={<ToolOutlined />}>{toolsStatus.available ? t('realtimeTask.toolsReady') : t('realtimeTask.noDocker')}</Tag>,
        <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => setShowNewSession(true)}>{t('realtimeTask.newSession')}</Button>,
      ]}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <ProCard bordered title={t('realtimeTask.sessions')}>
            {sessions.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('realtimeTask.noSessions')} />
            ) : (
              <List
                dataSource={sessions}
                renderItem={session => (
                  <List.Item
                    style={{ cursor: 'pointer', background: activeSession?.session_id === session.session_id ? '#e6f4ff' : undefined, padding: 12, borderRadius: 8, marginBottom: 8 }}
                    onClick={() => loadSession(session.session_id)}
                    actions={[
                      <Popconfirm key="delete" title={t('realtimeTask.deleteConfirm')} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={(event) => { event?.stopPropagation(); deleteSession(session.session_id) }}>
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={event => event.stopPropagation()} />
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      title={<Text strong ellipsis>{session.name}</Text>}
                      description={<Space direction="vertical" size={2}><Text type="secondary" ellipsis>{session.target}</Text><Space><Text type="secondary">{t('realtimeTask.messages', { count: session.messages_count })}</Text>{session.findings_count > 0 && <Badge count={session.findings_count} />}</Space></Space>}
                    />
                  </List.Item>
                )}
              />
            )}
          </ProCard>
        </Col>

        <Col xs={24} lg={11}>
          <ProCard bordered style={{ minHeight: 'calc(100vh - 220px)' }}>
            {activeSession ? (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space direction="vertical" size={2}>
                    <Text strong><GlobalOutlined /> {activeSession.name}</Text>
                    <Text type="secondary">{activeSession.target}</Text>
                  </Space>
                  <Space wrap>
                    <Button icon={<ToolOutlined />} disabled={Boolean(executingTool)} onClick={() => setShowToolsModal(true)}>{t('realtimeTask.toolsButton')}</Button>
                    <Dropdown menu={reportMenu} placement="bottomRight">
                      <Button icon={<FileTextOutlined />} loading={generatingReport}>{t('realtimeTask.reportButton')}</Button>
                    </Dropdown>
                  </Space>
                </Space>

                <div style={{ height: 'calc(100vh - 430px)', minHeight: 360, overflowY: 'auto', paddingRight: 8 }}>
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {activeSession.messages.length === 0 ? (
                      <Empty description={t('realtimeTask.noMessages')} />
                    ) : activeSession.messages.map(renderMessage)}
                    {(isSending || executingTool) && <Alert type="info" showIcon message={executingTool ? t('realtimeTask.runningTool', { tool: executingTool }) : t('realtimeTask.analyzing')} />}
                    <div ref={messagesEndRef} />
                  </Space>
                </div>

                <Space size={[8, 8]} wrap>
                  {getQuickPrompts(t).map(prompt => <Button key={prompt.label} size="small" icon={prompt.icon} disabled={isSending || Boolean(executingTool)} onClick={() => sendMessage(prompt.prompt)}>{prompt.label}</Button>)}
                </Space>

                <Space.Compact style={{ width: '100%' }}>
                  <Input.TextArea
                    ref={inputRef}
                    value={message}
                    onChange={event => setMessage(event.target.value)}
                    onPressEnter={event => {
                      if (!event.shiftKey) {
                        event.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder={t('realtimeTask.sendInstruction')}
                    disabled={isSending || Boolean(executingTool)}
                    autoSize={{ minRows: 1, maxRows: 4 }}
                  />
                  <Button type="primary" icon={<SendOutlined />} loading={isSending} disabled={!message.trim() || Boolean(executingTool)} onClick={() => sendMessage()} />
                </Space.Compact>
              </Space>
            ) : (
              <Empty description={t('realtimeTask.noSessionSelected')}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowNewSession(true)}>{t('realtimeTask.createNewSession')}</Button>
              </Empty>
            )}
          </ProCard>
        </Col>

        <Col xs={24} lg={7}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <ProCard bordered title={<Space><SafetyCertificateOutlined />{t('realtimeTask.findingsHeader')} <Badge count={sortedFindings.length} /></Space>}>
              {Object.keys(severityStats).length > 0 && <Space wrap style={{ marginBottom: 12 }}>{Object.entries(severityStats).map(([severity, count]) => <Tag key={severity} color={severityColor(severity)}>{count} {t(`severity.${severity}`)}</Tag>)}</Space>}
              {sortedFindings.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('realtimeTask.noFindings')} /> : sortedFindings.map(renderFinding)}
            </ProCard>

            {activeSession?.recon_data?.technologies?.length ? (
              <ProCard bordered title={t('realtimeTask.technologies')}>
                <Space wrap>{activeSession.recon_data.technologies.map(tech => <Tag key={tech}>{tech}</Tag>)}</Space>
              </ProCard>
            ) : null}
          </Space>
        </Col>
      </Row>

      {error && <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} />}

      <Modal
        title={t('realtimeTask.createSession')}
        open={showNewSession}
        confirmLoading={isCreating}
        okButtonProps={{ disabled: !newTarget.trim() }}
        onOk={createSession}
        onCancel={() => { setShowNewSession(false); setError(null) }}
        okText={t('realtimeTask.create')}
        cancelText={t('common.cancel')}
      >
        <Form layout="vertical">
          <Form.Item label={t('realtimeTask.targetUrl')} required>
            <Input value={newTarget} onChange={event => setNewTarget(event.target.value)} placeholder={t('realtimeTask.targetPlaceholder')} autoFocus />
          </Form.Item>
          <Form.Item label={t('realtimeTask.sessionName')}>
            <Input value={newSessionName} onChange={event => setNewSessionName(event.target.value)} placeholder={t('realtimeTask.sessionNamePlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('realtimeTask.executeTool')}
        open={showToolsModal}
        footer={null}
        width={760}
        onCancel={() => setShowToolsModal(false)}
      >
        {activeSession && <Paragraph type="secondary">{t('realtimeTask.target', { target: activeSession.target })}</Paragraph>}
        {!toolsStatus?.available && <Alert type="warning" showIcon message={t('realtimeTask.dockerNotAvailable')} style={{ marginBottom: 16 }} />}
        <Row gutter={[12, 12]}>
          {getToolPrompts(t).map(tool => (
            <Col key={tool.tool} xs={24} sm={12} md={8}>
              <Card hoverable onClick={() => toolsStatus?.available && !executingTool && executeTool(tool.tool)} style={{ opacity: toolsStatus?.available ? 1 : 0.6 }}>
                <Space direction="vertical">
                  <Text strong>{tool.icon} {tool.label}</Text>
                  <Text type="secondary">{tool.description}</Text>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Modal>
    </PageContainer>
  )
}
