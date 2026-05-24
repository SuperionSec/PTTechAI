import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ProCard, StatisticCard } from '@ant-design/pro-components'
import { Badge, Card, Empty, Progress, Row, Col, Space, Tag, Tooltip, Typography } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { agentApi } from '../services/api'
import type { VulnAgentStatus, VulnAgentDashboard } from '../types'

const { Text } = Typography

const CATEGORY_COLORS: Record<string, string> = {
  xss_reflected: 'gold',
  xss_stored: 'gold',
  xss_dom: 'gold',
  blind_xss: 'gold',
  mutation_xss: 'gold',
  sqli_error: 'red',
  sqli_union: 'red',
  sqli_blind: 'red',
  sqli_time: 'red',
  ssrf: 'purple',
  ssrf_cloud: 'purple',
  auth_bypass: 'blue',
  idor: 'blue',
  bola: 'blue',
  bfla: 'blue',
  privilege_escalation: 'blue',
  command_injection: 'volcano',
  ssti: 'volcano',
  lfi: 'orange',
  rfi: 'orange',
  path_traversal: 'orange',
  xxe: 'orange',
}

function getCategoryColor(vulnType: string): string {
  return CATEGORY_COLORS[vulnType] || 'default'
}

function getShortName(vulnType: string): string {
  const names: Record<string, string> = {
    sqli_error: 'SQLi Err',
    sqli_union: 'SQLi Union',
    sqli_blind: 'SQLi Blind',
    sqli_time: 'SQLi Time',
    xss_reflected: 'XSS Refl',
    xss_stored: 'XSS Stored',
    xss_dom: 'XSS DOM',
    blind_xss: 'Blind XSS',
    mutation_xss: 'Mut XSS',
    command_injection: 'Cmd Inj',
    expression_language_injection: 'EL Inj',
    nosql_injection: 'NoSQLi',
    ldap_injection: 'LDAP Inj',
    xpath_injection: 'XPath Inj',
    orm_injection: 'ORM Inj',
    graphql_injection: 'GQL Inj',
    path_traversal: 'Path Trav',
    arbitrary_file_read: 'File Read',
    ssrf_cloud: 'SSRF Cloud',
    open_redirect: 'Open Redir',
    crlf_injection: 'CRLF',
    header_injection: 'Header Inj',
    host_header_injection: 'Host Hdr',
    http_smuggling: 'Smuggling',
    parameter_pollution: 'Param Poll',
    log_injection: 'Log Inj',
    html_injection: 'HTML Inj',
    csv_injection: 'CSV Inj',
    email_injection: 'Email Inj',
    prototype_pollution: 'Proto Poll',
    soap_injection: 'SOAP Inj',
    type_juggling: 'Type Jugg',
    cache_poisoning: 'Cache Poi',
    security_headers: 'Sec Hdrs',
    http_methods: 'HTTP Meth',
    ssl_issues: 'SSL/TLS',
    cors_misconfig: 'CORS',
    directory_listing: 'Dir List',
    debug_mode: 'Debug',
    exposed_admin_panel: 'Admin Exp',
    exposed_api_docs: 'API Docs',
    insecure_cookie_flags: 'Cookies',
    sensitive_data_exposure: 'Data Exp',
    information_disclosure: 'Info Disc',
    api_key_exposure: 'API Keys',
    version_disclosure: 'Version',
    cleartext_transmission: 'Cleartext',
    weak_encryption: 'Weak Enc',
    weak_hashing: 'Weak Hash',
    source_code_disclosure: 'Src Disc',
    backup_file_exposure: 'Backup Exp',
    graphql_introspection: 'GQL Intro',
    auth_bypass: 'Auth Byp',
    jwt_manipulation: 'JWT Manip',
    session_fixation: 'Sess Fix',
    weak_password: 'Weak Pass',
    default_credentials: 'Default Creds',
    brute_force: 'Brute Force',
    two_factor_bypass: '2FA Byp',
    oauth_misconfiguration: 'OAuth Misc',
    privilege_escalation: 'Priv Esc',
    mass_assignment: 'Mass Assign',
    forced_browsing: 'Forced Brw',
    race_condition: 'Race Cond',
    business_logic: 'Biz Logic',
    rate_limit_bypass: 'Rate Limit',
    timing_attack: 'Timing',
    insecure_deserialization: 'Deserial',
    file_upload: 'File Upload',
    arbitrary_file_delete: 'File Del',
    zip_slip: 'Zip Slip',
    dom_clobbering: 'DOM Clob',
    postmessage_vulnerability: 'PostMsg',
    websocket_hijacking: 'WS Hijack',
    css_injection: 'CSS Inj',
    tabnabbing: 'Tabnab',
    subdomain_takeover: 'Subdomain',
    cloud_metadata_exposure: 'Cloud Meta',
    s3_bucket_misconfiguration: 'S3 Bucket',
    serverless_misconfiguration: 'Serverless',
    container_escape: 'Container',
    vulnerable_dependency: 'Vuln Dep',
    outdated_component: 'Outdated',
    insecure_cdn: 'CDN',
    weak_random: 'Weak Rand',
    graphql_dos: 'GQL DoS',
    rest_api_versioning: 'API Ver',
    api_rate_limiting: 'API Rate',
    excessive_data_exposure: 'Data Overexp',
    improper_error_handling: 'Error Hndl',
  }
  return names[vulnType] || vulnType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).substring(0, 12)
}

function statusIcon(status: string) {
  if (status === 'running') return <LoadingOutlined spin />
  if (status === 'completed') return <CheckCircleOutlined />
  if (status === 'failed') return <CloseCircleOutlined />
  if (status === 'cancelled') return <ExclamationCircleOutlined />
  return <ClockCircleOutlined />
}

function statusBadge(status: string) {
  if (status === 'running') return 'processing'
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'cancelled') return 'warning'
  return 'default'
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return null
  return seconds < 60 ? `${Math.round(seconds)}s` : `${(seconds / 60).toFixed(1)}m`
}

interface Props {
  agentId: string
  isRunning: boolean
}

export default function VulnAgentGrid({ agentId, isRunning }: Props) {
  const { t } = useTranslation()
  const [data, setData] = useState<VulnAgentDashboard | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await agentApi.getVulnAgents(agentId)
        setData(result)
      } catch {}
    }

    fetchData()

    if (isRunning) {
      pollRef.current = setInterval(fetchData, 2000)
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [agentId, isRunning])

  const pendingCount = useMemo(() => {
    if (!data) return 0
    const { stats } = data
    return stats.total - stats.completed - stats.running - stats.failed - (stats.cancelled || 0)
  }, [data])

  if (!data || !data.enabled) {
    return (
      <ProCard>
        <Empty
          image={<SafetyCertificateOutlined style={{ fontSize: 40, color: '#bfbfbf' }} />}
          description={(
            <Space direction="vertical" size={0}>
              <Text>{t('vulnAgent.notEnabled')}</Text>
              <Text type="secondary">{t('vulnAgent.enableHint')}</Text>
            </Space>
          )}
        />
      </ProCard>
    )
  }

  const { agents, stats } = data
  const percent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <ProCard
        title={<Space><SafetyCertificateOutlined />{t('vulnAgent.title')}<Tag>{stats.total} types</Tag></Space>}
        extra={stats.elapsed > 0 ? <Tag icon={<ClockCircleOutlined />}>{formatDuration(stats.elapsed)}</Tag> : null}
      >
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} md={4}><StatisticCard statistic={{ title: t('vulnAgent.done'), value: stats.completed, icon: <CheckCircleOutlined />, valueStyle: { color: '#52c41a' } }} /></Col>
          <Col xs={12} sm={8} md={4}><StatisticCard statistic={{ title: t('vulnAgent.running'), value: stats.running, icon: <LoadingOutlined />, valueStyle: { color: '#1677ff' } }} /></Col>
          <Col xs={12} sm={8} md={4}><StatisticCard statistic={{ title: t('vulnAgent.failed'), value: stats.failed, icon: <CloseCircleOutlined />, valueStyle: { color: '#ff4d4f' } }} /></Col>
          <Col xs={12} sm={8} md={4}><StatisticCard statistic={{ title: t('vulnAgent.pending'), value: pendingCount, icon: <ClockCircleOutlined /> }} /></Col>
          <Col xs={12} sm={8} md={4}><StatisticCard statistic={{ title: t('vulnAgent.findings'), value: stats.findings_total, valueStyle: { color: '#cf1322' } }} /></Col>
          <Col xs={12} sm={8} md={4}><StatisticCard statistic={{ title: 'Progress', value: `${percent}%` }} /></Col>
        </Row>
        {stats.total > 0 && <Progress percent={percent} status={stats.failed > 0 ? 'exception' : stats.running > 0 ? 'active' : 'success'} style={{ marginTop: 16 }} />}
      </ProCard>

      <ProCard>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
          {agents.map((agent: VulnAgentStatus) => (
            <Tooltip
              key={agent.vuln_type}
              title={(
                <Space direction="vertical" size={2}>
                  <Text style={{ color: 'white' }}>{agent.vuln_type.replace(/_/g, ' ')}</Text>
                  <Text style={{ color: 'white' }}>{t('vulnAgent.status')}: {agent.status}</Text>
                  <Text style={{ color: 'white' }}>{t('vulnAgent.targets')}: {agent.targets_tested}/{agent.targets_total}</Text>
                  {agent.findings_count > 0 && <Text style={{ color: '#ff7875' }}>{agent.findings_count} {t('vulnAgent.findingCount')}</Text>}
                  {agent.duration != null && agent.duration > 0 && <Text style={{ color: 'white' }}>{t('vulnAgent.duration')}: {formatDuration(agent.duration)}</Text>}
                  {agent.error && <Text style={{ color: '#ff7875' }}>{t('vulnAgent.error')}: {agent.error}</Text>}
                </Space>
              )}
            >
              <Card
                size="small"
                hoverable
                style={{ borderColor: agent.findings_count > 0 ? '#ff4d4f' : undefined }}
                bodyStyle={{ padding: 8 }}
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Badge status={statusBadge(agent.status) as any} />
                    {statusIcon(agent.status)}
                    {agent.findings_count > 0 && <Badge count={agent.findings_count} size="small" />}
                  </Space>
                  <Tag color={getCategoryColor(agent.vuln_type)} style={{ marginInlineEnd: 0, width: '100%', textAlign: 'center' }}>
                    {getShortName(agent.vuln_type)}
                  </Tag>
                  {agent.status === 'running' && <Progress percent={agent.progress} size="small" showInfo={false} />}
                </Space>
              </Card>
            </Tooltip>
          ))}
        </div>
      </ProCard>
    </Space>
  )
}
