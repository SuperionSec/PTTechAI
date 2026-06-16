import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components'
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Collapse,
  Descriptions,
  Dropdown,
  Empty,
  Input,
  List,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Col,
  Space,
  Steps,
  Switch,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  BranchesOutlined,
  BugOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DownloadOutlined,
  FileTextOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  StopOutlined,
  ThunderboltOutlined,
  WifiOutlined,
} from '@ant-design/icons'
import { agentApi, reportsApi } from '../services/api'
import type { AgentFinding, AgentLog, AgentStatus } from '../types'
import { relativeTime } from '../utils/time'
import { isLogContainerNearBottom } from '../utils/logScroll'

const { Link, Paragraph, Text } = Typography
const { TextArea } = Input

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const PHASE_KEYS = ['recon', 'analysis', 'testing', 'enhancement', 'completed']

const severityColor: Record<Severity, string> = {
  critical: 'red',
  high: 'volcano',
  medium: 'orange',
  low: 'blue',
  info: 'default',
}

const statusColor: Record<AgentStatus['status'], 'processing' | 'warning' | 'success' | 'error' | 'default'> = {
  running: 'processing',
  paused: 'warning',
  completed: 'success',
  error: 'error',
  stopped: 'default',
}

function getScanPhases(t: (key: string) => string) {
  return [
    { key: 'recon', title: t('agent.reconnaissance'), icon: <ApiOutlined /> },
    { key: 'analysis', title: t('agent.analysis'), icon: <RobotOutlined /> },
    { key: 'testing', title: t('agent.testing'), icon: <SafetyCertificateOutlined /> },
    { key: 'enhancement', title: t('agent.enhancement'), icon: <ThunderboltOutlined /> },
    { key: 'completed', title: t('agent.completed'), icon: <CheckCircleOutlined /> },
  ]
}

function getModeLabels(t: (key: string) => string): Record<string, string> {
  return {
    full_auto: t('agent.fullAuto'),
    recon_only: t('agent.reconOnly'),
    prompt_only: t('agent.promptOnly'),
    analyze_only: t('agent.analyzeOnly'),
    auto_pentest: t('autoPentest.title'),
  }
}

function getPhaseIndex(phase: string): number {
  const p = phase.toLowerCase()
  if (p.includes('recon') || p.includes('initializing')) return 0
  if (p.includes('analysis') || p.includes('attack surface')) return 1
  if (p.includes('test') || p.includes('vuln')) return 2
  if (p.includes('enhance') || p.includes('finding')) return 3
  if (p.includes('complete') || p.includes('report')) return 4
  return 0
}

function formatStatusLabel(status: AgentStatus['status'], t: (key: string) => string) {
  const labels: Record<AgentStatus['status'], string> = {
    running: t('agent.statusRunning'),
    paused: t('agent.statusPaused'),
    completed: t('agent.statusCompleted'),
    error: t('agent.statusError'),
    stopped: t('agent.statusStopped'),
  }
  return labels[status]
}

function confidenceColor(score?: number) {
  if (typeof score !== 'number') return 'default'
  if (score >= 90) return 'green'
  if (score >= 60) return 'orange'
  return 'red'
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildReportHtml(status: AgentStatus, agentId: string | undefined, modeLabel: string) {
  const sorted = [...status.findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
  const sc: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const f of sorted) { if (f.severity in sc) sc[f.severity]++ }
  const total = sorted.length

  const sevColors: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6', info: '#6b7280' }
  const sevBg: Record<string, string> = { critical: 'rgba(239,68,68,.08)', high: 'rgba(249,115,22,.08)', medium: 'rgba(234,179,8,.08)', low: 'rgba(59,130,246,.08)', info: 'rgba(107,114,128,.08)' }

  const owaspMap: Record<string, string> = {
    sqli: 'A03:2021 Injection', sql_injection: 'A03:2021 Injection', xss: 'A03:2021 Injection',
    xss_reflected: 'A03:2021 Injection', xss_stored: 'A03:2021 Injection',
    command_injection: 'A03:2021 Injection', ssrf: 'A10:2021 SSRF', idor: 'A01:2021 Broken Access Control',
    bola: 'A01:2021 Broken Access Control', csrf: 'A01:2021 Broken Access Control',
    auth_bypass: 'A07:2021 Auth Failures', open_redirect: 'A01:2021 Broken Access Control',
    lfi: 'A01:2021 Broken Access Control', path_traversal: 'A01:2021 Broken Access Control',
    ssti: 'A03:2021 Injection', xxe: 'A05:2021 Misconfiguration', cors: 'A05:2021 Misconfiguration',
    security_headers: 'A05:2021 Misconfiguration', deserialization: 'A08:2021 Integrity Failures',
    cryptographic_failures: 'A02:2021 Crypto Failures',
  }
  const getOwasp = (type: string): string => owaspMap[type] || owaspMap[type.split('_')[0]] || ''

  const riskScore = Math.min(100, sc.critical * 25 + sc.high * 15 + sc.medium * 8 + sc.low * 3)
  const riskLevel = riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 25 ? 'MEDIUM' : 'LOW'
  const riskColor = riskScore >= 75 ? '#ef4444' : riskScore >= 50 ? '#f97316' : riskScore >= 25 ? '#eab308' : '#22c55e'
  const barPcts = SEVERITY_ORDER.map(s => total > 0 ? Math.round((sc[s] / total) * 100) : 0)

  const tocHtml = sorted.map((f, i) =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #1e293b;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sevColors[f.severity]};margin-right:8px;"></span>${f.severity.toUpperCase()}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #1e293b;"><a href="#finding-${i + 1}" style="color:#93c5fd;text-decoration:none;">${escapeHtml(f.title)}</a></td>
      <td style="padding:6px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-family:monospace;font-size:12px;">${escapeHtml(f.vulnerability_type)}</td>
    </tr>`
  ).join('')

  const findingsHtml = sorted.map((f, idx) => {
    const color = sevColors[f.severity]
    const bg = sevBg[f.severity]
    const owasp = getOwasp(f.vulnerability_type)
    const cweLink = f.cwe_id ? `https://cwe.mitre.org/data/definitions/${f.cwe_id.replace('CWE-', '')}.html` : ''
    const confScore = f.confidence_score || 0
    const confColor = confScore >= 80 ? '#22c55e' : confScore >= 50 ? '#eab308' : '#ef4444'
    const confLabel = confScore >= 80 ? 'Confirmed' : confScore >= 50 ? 'Likely' : 'Unconfirmed'

    const section = (title: string, content: string, icon = '') =>
      `<div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          ${icon ? `<span style="font-size:14px;">${icon}</span>` : ''}
          <h4 style="margin:0;color:#e2e8f0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${title}</h4>
        </div>
        ${content}
      </div>`

    const codeBlock = (text: string, maxLen = 3000) =>
      `<pre style="background:#020617;border:1px solid #1e293b;border-radius:6px;padding:14px;margin:0;overflow-x:auto;font-family:'SF Mono',Monaco,monospace;font-size:12px;line-height:1.6;color:#e2e8f0;white-space:pre-wrap;word-break:break-all;">${escapeHtml(text.slice(0, maxLen))}</pre>`

    return `
    <div id="finding-${idx + 1}" style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;margin-bottom:28px;overflow:hidden;page-break-inside:avoid;">
      <div style="padding:24px;background:${bg};border-bottom:1px solid #1e293b;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
          <span style="background:${color};color:#fff;padding:4px 14px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${f.severity}</span>
          <span style="color:#475569;font-size:12px;font-weight:500;">FINDING #${idx + 1} of ${total}</span>
          ${owasp ? `<span style="background:rgba(251,191,36,.1);color:#fbbf24;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:500;">${owasp}</span>` : ''}
          ${confScore > 0 ? `<span style="background:rgba(0,0,0,.3);color:${confColor};padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;">${confScore}% ${confLabel}</span>` : ''}
        </div>
        <h3 style="margin:0 0 8px;color:#f8fafc;font-size:20px;font-weight:600;line-height:1.3;">${escapeHtml(f.title)}</h3>
        <div style="font-family:'SF Mono',Monaco,monospace;font-size:13px;color:#64748b;word-break:break-all;">${escapeHtml(f.affected_endpoint)}</div>
      </div>
      <div style="padding:24px;">
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px;">
          ${f.cvss_score ? `
          <div style="background:#020617;border:1px solid #1e293b;border-radius:8px;padding:12px 18px;min-width:120px;">
            <div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">CVSS 3.1</div>
            <div style="font-size:26px;font-weight:700;color:${color};">${f.cvss_score}</div>
            ${f.cvss_vector ? `<div style="font-size:9px;color:#475569;font-family:monospace;margin-top:2px;">${escapeHtml(f.cvss_vector)}</div>` : ''}
          </div>` : ''}
          ${f.cwe_id ? `
          <div style="background:#020617;border:1px solid #1e293b;border-radius:8px;padding:12px 18px;min-width:120px;">
            <div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">CWE</div>
            <a href="${cweLink}" target="_blank" style="color:#60a5fa;text-decoration:none;font-size:15px;font-weight:600;">${escapeHtml(f.cwe_id)}</a>
          </div>` : ''}
          <div style="background:#020617;border:1px solid #1e293b;border-radius:8px;padding:12px 18px;min-width:120px;">
            <div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">TYPE</div>
            <div style="color:#e2e8f0;font-size:14px;font-weight:500;">${escapeHtml(f.vulnerability_type)}</div>
          </div>
          ${f.parameter ? `
          <div style="background:#020617;border:1px solid #1e293b;border-radius:8px;padding:12px 18px;min-width:120px;">
            <div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">PARAMETER</div>
            <div style="color:#38bdf8;font-size:14px;font-family:monospace;">${escapeHtml(f.parameter)}</div>
          </div>` : ''}
        </div>
        ${f.description ? section('Description', `<p style="color:#cbd5e1;margin:0;line-height:1.8;font-size:14px;">${escapeHtml(f.description)}</p>`, '\u{1F4CB}') : ''}
        ${f.evidence ? section('Evidence', codeBlock(f.evidence), '\u{1F50D}') : ''}
        ${f.payload ? section('Payload', codeBlock(f.payload, 1000), '\u{1F489}') : ''}
        ${f.request ? section('HTTP Request', codeBlock(f.request, 2000), '\u{1F4E4}') : ''}
        ${f.response ? section('HTTP Response (excerpt)', codeBlock(f.response, 2000), '\u{1F4E5}') : ''}
        ${f.poc_code ? section('Proof of Concept Code', codeBlock(f.poc_code, 4000), '\u26A1') : ''}
        ${f.proof_of_execution ? section('Proof of Execution', `<p style="color:#22c55e;margin:0;font-size:14px;line-height:1.7;padding:12px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:6px;">${escapeHtml(f.proof_of_execution)}</p>`, '\u2705') : ''}
        ${f.impact ? section('Impact', `<p style="color:#fbbf24;margin:0;line-height:1.7;font-size:14px;padding:12px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.12);border-radius:6px;">${escapeHtml(f.impact)}</p>`, '\u26A0\uFE0F') : ''}
        ${f.remediation ? `
        <div style="margin-bottom:20px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:8px;padding:16px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:14px;">\u{1F6E1}\uFE0F</span>
            <h4 style="margin:0;color:#4ade80;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Remediation</h4>
          </div>
          <p style="color:#cbd5e1;margin:0;line-height:1.8;font-size:14px;">${escapeHtml(f.remediation)}</p>
        </div>` : ''}
        ${f.references && f.references.length > 0 ? section('References',
          `<ul style="margin:0;padding-left:20px;color:#94a3b8;font-size:13px;line-height:2;">
            ${f.references.map(ref => `<li><a href="${escapeHtml(ref)}" target="_blank" style="color:#60a5fa;text-decoration:none;">${escapeHtml(ref)}</a></li>`).join('')}
          </ul>`, '\u{1F4DA}') : ''}
        ${f.confidence_breakdown && Object.keys(f.confidence_breakdown).length > 0 ? section('Confidence Breakdown',
          `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            ${Object.entries(f.confidence_breakdown).map(([key, val]) => `<div style="background:#020617;border:1px solid #1e293b;border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">
              <span style="color:#94a3b8;font-size:12px;">${key.replace(/_/g, ' ')}</span>
              <span style="color:${val > 0 ? '#22c55e' : val < 0 ? '#ef4444' : '#64748b'};font-weight:600;font-size:13px;">${val > 0 ? '+' : ''}${val}</span>
            </div>`).join('')}
          </div>`, '\u{1F4CA}') : ''}
      </div>
    </div>`
  }).join('')

  const uniqueEndpoints = [...new Set(sorted.map(f => f.affected_endpoint).filter(Boolean))]
  const uniqueTypes = [...new Set(sorted.map(f => f.vulnerability_type).filter(Boolean))]

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PTTechAI Security Report - ${escapeHtml(status.target)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#020617;color:#e2e8f0;line-height:1.6}
  .page{max-width:1100px;margin:0 auto;padding:40px 32px}
  a{color:#60a5fa}
  @media print{
    body{background:#fff;color:#1e293b;font-size:11pt}
    .page{padding:20px}
    .no-print{display:none!important}
    pre{border:1px solid #e2e8f0!important;background:#f8fafc!important;color:#1e293b!important}
    h1,h2,h3{color:#0f172a!important}
  }
  @page{margin:1.5cm;size:A4}
</style>
</head>
<body>
<div class="page">
  <div style="text-align:center;padding:48px 0 40px;border-bottom:2px solid #1e293b;margin-bottom:40px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:4px;color:#64748b;margin-bottom:16px;">Confidential Security Report</div>
    <h1 style="color:#f8fafc;font-size:32px;font-weight:700;margin-bottom:12px;">Penetration Test Report</h1>
    <div style="color:#94a3b8;font-size:15px;margin-bottom:8px;">Target: <span style="color:#38bdf8;font-family:monospace;">${escapeHtml(status.target)}</span></div>
    <div style="color:#64748b;font-size:13px;">
      ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      &nbsp;&bull;&nbsp; Agent: ${escapeHtml(agentId || '')}
      &nbsp;&bull;&nbsp; Mode: ${escapeHtml(modeLabel)}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:240px 1fr;gap:32px;margin-bottom:40px;align-items:start;">
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:28px;text-align:center;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#64748b;margin-bottom:12px;">Risk Level</div>
      <div style="font-size:56px;font-weight:800;color:${riskColor};line-height:1;">${riskScore}</div>
      <div style="font-size:13px;color:${riskColor};font-weight:600;margin-top:4px;">${riskLevel}</div>
      <div style="height:6px;background:#1e293b;border-radius:3px;margin-top:16px;overflow:hidden;">
        <div style="height:100%;width:${riskScore}%;background:${riskColor};border-radius:3px;"></div>
      </div>
    </div>
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:28px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#64748b;margin-bottom:16px;">Findings Breakdown</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:20px;">
        <div style="text-align:center;"><div style="font-size:32px;font-weight:700;color:#f8fafc;">${total}</div><div style="font-size:11px;color:#64748b;text-transform:uppercase;">Total</div></div>
        ${SEVERITY_ORDER.map(s => `<div style="text-align:center;"><div style="font-size:32px;font-weight:700;color:${sevColors[s]};">${sc[s]}</div><div style="font-size:11px;color:#64748b;text-transform:uppercase;">${s}</div></div>`).join('')}
      </div>
      ${total > 0 ? `
      <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;">
        ${SEVERITY_ORDER.map((s, i) => barPcts[i] > 0 ? `<div style="width:${barPcts[i]}%;background:${sevColors[s]};"></div>` : '').join('')}
      </div>` : ''}
    </div>
  </div>
  <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:28px;margin-bottom:40px;">
    <h2 style="color:#f8fafc;font-size:18px;font-weight:600;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #1e293b;">Executive Summary</h2>
    <p style="color:#cbd5e1;line-height:1.9;font-size:14px;">
      A security assessment was performed against <strong style="color:#f8fafc;">${escapeHtml(status.target)}</strong>
      using PTTechAI AI-powered penetration testing. The assessment identified
      <strong style="color:#f8fafc;">${total} security finding${total !== 1 ? 's' : ''}</strong>
      across <strong>${uniqueEndpoints.length}</strong> unique endpoint${uniqueEndpoints.length !== 1 ? 's' : ''}
      covering <strong>${uniqueTypes.length}</strong> distinct vulnerability type${uniqueTypes.length !== 1 ? 's' : ''}.
      ${sc.critical > 0 ? `<br/><br/><span style="color:#ef4444;font-weight:600;">&#9888; ${sc.critical} critical-severity finding${sc.critical > 1 ? 's' : ''} require${sc.critical === 1 ? 's' : ''} immediate remediation.</span>` : ''}
      ${sc.high > 0 ? ` <span style="color:#f97316;font-weight:500;">${sc.high} high-severity finding${sc.high > 1 ? 's' : ''} should be addressed promptly.</span>` : ''}
      ${sc.critical === 0 && sc.high === 0 && total > 0 ? ' No critical or high-severity vulnerabilities were identified.' : ''}
      ${total === 0 ? ' No vulnerabilities were identified during this assessment.' : ''}
    </p>
  </div>
  ${total > 0 ? `
  <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:28px;margin-bottom:40px;">
    <h2 style="color:#f8fafc;font-size:18px;font-weight:600;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #1e293b;">Findings Index</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="border-bottom:2px solid #1e293b;">
          <th style="text-align:left;padding:8px 12px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;width:100px;">Severity</th>
          <th style="text-align:left;padding:8px 12px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Finding</th>
          <th style="text-align:left;padding:8px 12px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;width:180px;">Type</th>
        </tr>
      </thead>
      <tbody>${tocHtml}</tbody>
    </table>
  </div>
  <div style="margin-bottom:40px;">
    <h2 style="color:#f8fafc;font-size:20px;font-weight:600;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #1e293b;">
      Detailed Findings <span style="color:#64748b;font-weight:400;font-size:14px;">(${total})</span>
    </h2>
    ${findingsHtml}
  </div>
  ` : ''}
  <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:28px;margin-bottom:40px;">
    <h2 style="color:#f8fafc;font-size:18px;font-weight:600;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #1e293b;">Scope &amp; Methodology</h2>
    <table style="width:100%;font-size:13px;color:#cbd5e1;">
      <tr><td style="padding:6px 0;color:#64748b;width:180px;">Target URL</td><td style="padding:6px 0;font-family:monospace;">${escapeHtml(status.target)}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Assessment Mode</td><td style="padding:6px 0;">${escapeHtml(modeLabel)}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Agent ID</td><td style="padding:6px 0;font-family:monospace;">${escapeHtml(agentId || '')}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Start Time</td><td style="padding:6px 0;">${status.started_at ? new Date(status.started_at).toLocaleString() : 'N/A'}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">End Time</td><td style="padding:6px 0;">${status.completed_at ? new Date(status.completed_at).toLocaleString() : 'N/A'}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Endpoints Tested</td><td style="padding:6px 0;">${uniqueEndpoints.length}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Vulnerability Types</td><td style="padding:6px 0;">${uniqueTypes.length}</td></tr>
    </table>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px;line-height:1.7;">
      This assessment was conducted using PTTechAI AI-powered penetration testing platform with automated payload generation,
      AI-driven validation, and confidence scoring. Findings were validated through negative control testing,
      proof-of-execution verification, and confidence scoring.
    </p>
  </div>
  <div style="text-align:center;padding:32px 0;border-top:1px solid #1e293b;color:#475569;font-size:12px;">
    <div style="margin-bottom:8px;"><strong style="color:#94a3b8;">Generated by PTTechAI</strong> &mdash; AI-Powered Penetration Testing Platform</div>
    <div>${new Date().toISOString()}</div>
    <div style="margin-top:12px;font-size:11px;color:#334155;">CONFIDENTIAL &mdash; This document contains sensitive security information. Distribution is restricted to authorized personnel only.</div>
  </div>
</div>
</body>
</html>`
}

export default function AgentStatusPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const scriptLogsContainerRef = useRef<HTMLDivElement>(null)
  const llmLogsContainerRef = useRef<HTMLDivElement>(null)
  const scriptStickRef = useRef(true)
  const llmStickRef = useRef(true)
  const consecutiveErrorsRef = useRef(0)

  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [isGeneratingAiReport, setIsGeneratingAiReport] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [connectionLost, setConnectionLost] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false)
  const [skippedPhases, setSkippedPhases] = useState<Set<string>>(new Set())

  const scanPhases = useMemo(() => getScanPhases(t), [t])
  const modeLabels = useMemo(() => getModeLabels(t), [t])

  const scriptLogs = useMemo(
    () => logs.filter(log => log.source === 'script' || (!log.source && !log.message.includes('[LLM]') && !log.message.includes('[AI]'))),
    [logs],
  )
  const llmLogs = useMemo(
    () => logs.filter(log => log.source === 'llm' || log.message.includes('[LLM]') || log.message.includes('[AI]')),
    [logs],
  )
  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    status?.findings.forEach(finding => { counts[finding.severity] += 1 })
    return counts
  }, [status])

  const fetchStatus = useCallback(async () => {
    if (!agentId) return
    try {
      const [statusData, logsData] = await Promise.all([
        agentApi.getStatus(agentId),
        agentApi.getLogs(agentId, 500),
      ])
      setStatus(statusData)
      setLogs(logsData.logs || [])
      setError(null)
      if (consecutiveErrorsRef.current >= 3) {
        notification.success({ message: t('agent.connectionRestored') })
      }
      consecutiveErrorsRef.current = 0
      setConnectionLost(false)
    } catch (err: unknown) {
      const apiErr = err as { response?: { status?: number } }
      if (apiErr.response?.status === 404) {
        setError(t('agent.agentNotFound'))
      } else {
        consecutiveErrorsRef.current += 1
        if (consecutiveErrorsRef.current >= 3) setConnectionLost(true)
      }
    } finally {
      setIsLoading(false)
    }
  }, [agentId, notification, t])

  useEffect(() => {
    if (!agentId) return
    fetchStatus()
    const interval = window.setInterval(() => {
      if (status?.status === 'running' || status?.status === 'paused') fetchStatus()
    }, 5000)
    return () => window.clearInterval(interval)
  }, [agentId, fetchStatus, status?.status])

  useEffect(() => {
    if (!autoScroll) return
    if (scriptStickRef.current && scriptLogsContainerRef.current) scriptLogsContainerRef.current.scrollTop = scriptLogsContainerRef.current.scrollHeight
    if (llmStickRef.current && llmLogsContainerRef.current) llmLogsContainerRef.current.scrollTop = llmLogsContainerRef.current.scrollHeight
  }, [logs, autoScroll])

  useEffect(() => {
    if (!status) return
    const phase = status.phase.toLowerCase()
    if (phase.includes('_skipped')) {
      setSkippedPhases(prev => new Set(prev).add(phase.replace('_skipped', '')))
    }
  }, [status])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchStatus()
    setRefreshing(false)
    notification.info({ message: t('agent.statusRefreshed') })
  }, [fetchStatus, notification, t])

  const copyToClipboard = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    notification.success({ message: t('agent.copiedToClipboard') })
  }, [notification, t])

  const generateReportData = useCallback(() => {
    if (!status) return null
    return {
      report_info: {
        agent_id: agentId,
        target: status.target,
        mode: status.mode,
        status: status.status,
        started_at: status.started_at,
        completed_at: status.completed_at || new Date().toISOString(),
        total_findings: status.findings.length,
        severity_breakdown: severityCounts,
      },
      findings: status.findings,
      logs: logs.slice(-100),
    }
  }, [agentId, logs, severityCounts, status])

  const downloadBlob = useCallback((content: BlobPart, type: string, fileName: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleGenerateReport = useCallback(async (format: 'json' | 'html') => {
    if (!status) return
    setIsGeneratingReport(true)
    try {
      const date = new Date().toISOString().split('T')[0]
      if (format === 'html') {
        downloadBlob(buildReportHtml(status, agentId, modeLabels[status.mode] || status.mode), 'text/html', `pttechai-report-${agentId}-${date}.html`)
        notification.success({ message: t('agent.htmlReportDownloaded') })
      } else {
        const reportData = status.report || generateReportData()
        downloadBlob(JSON.stringify(reportData, null, 2), 'application/json', `pttechai-report-${agentId}-${date}.json`)
        notification.success({ message: t('agent.jsonReportDownloaded') })
      }
    } finally {
      setIsGeneratingReport(false)
    }
  }, [agentId, downloadBlob, generateReportData, modeLabels, notification, status, t])

  const handleGenerateAiReport = useCallback(async () => {
    if (!status?.scan_id) return
    setIsGeneratingAiReport(true)
    try {
      const report = await reportsApi.generateAiReport({ scan_id: status.scan_id, title: `AI Report - ${status.target || 'Agent Scan'}` })
      window.open(reportsApi.getViewUrl(report.id), '_blank')
      notification.success({ message: t('agent.aiReportGenerated') })
    } catch (err) {
      console.error('Failed to generate AI report:', err)
      notification.error({ message: t('agent.failedToGenerateReport') })
    } finally {
      setIsGeneratingAiReport(false)
    }
  }, [notification, status, t])

  const handleStopScan = useCallback(async () => {
    if (!agentId) return
    setIsStopping(true)
    try {
      await agentApi.stop(agentId)
      await fetchStatus()
      notification.info({ message: t('agent.agentStopped') })
    } catch (err) {
      console.error('Failed to stop agent:', err)
      notification.error({ message: t('agent.failedToStopAgent') })
    } finally {
      setIsStopping(false)
    }
  }, [agentId, fetchStatus, notification, t])

  const handlePauseScan = useCallback(async () => {
    if (!agentId) return
    try {
      await agentApi.pause(agentId)
      await fetchStatus()
      notification.info({ message: t('agent.agentPaused') })
    } catch (err) {
      console.error('Failed to pause agent:', err)
      notification.error({ message: t('agent.failedToPauseAgent') })
    }
  }, [agentId, fetchStatus, notification, t])

  const handleResumeScan = useCallback(async () => {
    if (!agentId) return
    try {
      await agentApi.resume(agentId)
      await fetchStatus()
      notification.success({ message: t('agent.agentResumed') })
    } catch (err) {
      console.error('Failed to resume agent:', err)
      notification.error({ message: t('agent.failedToResumeAgent') })
    }
  }, [agentId, fetchStatus, notification, t])

  const handleSubmitPrompt = useCallback(async () => {
    if (!customPrompt.trim() || !agentId) return
    setIsSubmittingPrompt(true)
    try {
      const sentPrompt = customPrompt
      await agentApi.sendPrompt(agentId, customPrompt)
      setCustomPrompt('')
      notification.success({ message: t('agent.promptSent', { preview: `${sentPrompt.slice(0, 50)}${sentPrompt.length > 50 ? '...' : ''}` }) })
      await fetchStatus()
    } catch (err) {
      console.error('Failed to send prompt:', err)
      notification.error({ message: t('agent.failedToSendPrompt') })
    } finally {
      setIsSubmittingPrompt(false)
    }
  }, [agentId, customPrompt, fetchStatus, notification, t])

  const handleSkipToPhase = useCallback(async (targetPhase: string) => {
    if (!agentId) return
    try {
      await agentApi.skipToPhase(agentId, targetPhase)
      const currentIndex = status ? getPhaseIndex(status.phase) : 0
      const targetIndex = PHASE_KEYS.indexOf(targetPhase)
      setSkippedPhases(prev => {
        const next = new Set(prev)
        for (let index = currentIndex; index < targetIndex; index += 1) next.add(PHASE_KEYS[index])
        return next
      })
      notification.info({ message: t('agent.skippedToPhase', { phase: scanPhases.find(phase => phase.key === targetPhase)?.title || targetPhase }) })
      await fetchStatus()
    } catch (err) {
      console.error('Failed to skip phase:', err)
      notification.error({ message: t('agent.failedToSkipPhase') })
    }
  }, [agentId, fetchStatus, notification, scanPhases, status, t])

  const renderLogViewer = useCallback((items: AgentLog[], ref: React.RefObject<HTMLDivElement>, stickRef: React.MutableRefObject<boolean>, emptyText: string, icon: ReactNode) => (
    <div
      ref={ref}
      onScroll={() => {
        const element = ref.current
        if (element) stickRef.current = isLogContainerNearBottom(element)
      }}
      style={{ maxHeight: 420, overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 12 }}
    >
      {items.length ? (
        <Timeline
          items={items.map((log, index) => ({
            color: log.level === 'error' ? 'red' : log.level === 'warning' ? 'orange' : log.level === 'success' ? 'green' : log.level === 'llm' ? 'purple' : 'blue',
            children: (
              <Space key={index} direction="vertical" size={2} style={{ width: '100%' }}>
                <Text type="secondary">{new Date(log.time).toLocaleTimeString()}</Text>
                {log.message.startsWith('[USER PROMPT]') ? (
                  <div style={{ background: '#e6f7ff', borderLeft: '4px solid #1890ff', padding: '4px 8px', borderRadius: 4 }}>
                    <Space size={4}>
                      <SendOutlined style={{ color: '#1890ff' }} />
                      <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.message}</Text>
                    </Space>
                  </div>
                ) : log.message.startsWith('[AI RESPONSE]') ? (
                  <div style={{ background: '#f9f0ff', borderLeft: '4px solid #722ed1', padding: '4px 8px', borderRadius: 4 }}>
                    <Space size={4}>
                      <RobotOutlined style={{ color: '#722ed1' }} />
                      <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.message}</Text>
                    </Space>
                  </div>
                ) : (
                  <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.message}</Text>
                )}
              </Space>
            ),
          }))}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Space>{icon}{emptyText}</Space>} />
      )}
    </div>
  ), [])

  const renderFindingDetails = useCallback((finding: AgentFinding) => {
    const cvssTagColor = typeof finding.cvss_score === 'number'
      ? finding.cvss_score >= 9 ? 'red'
        : finding.cvss_score >= 7 ? 'orange'
        : finding.cvss_score >= 4 ? 'gold'
        : 'green'
      : 'default'

    return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} bordered>
        <Descriptions.Item label="CVSS">
          {typeof finding.cvss_score === 'number'
            ? <Tag color={cvssTagColor}>{finding.cvss_score.toFixed(1)}</Tag>
            : <Tag>N/A</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="CWE">
          {finding.cwe_id
            ? <Link href={`https://cwe.mitre.org/data/definitions/${finding.cwe_id.replace('CWE-', '')}.html`} target="blank">{finding.cwe_id}</Link>
            : 'N/A'}
        </Descriptions.Item>
        <Descriptions.Item label={t('agent.confidence')}>
          {typeof finding.confidence_score === 'number'
            ? <Tag color={confidenceColor(finding.confidence_score)}>{finding.confidence_score}/100</Tag>
            : (finding.confidence || 'N/A')}
        </Descriptions.Item>
        <Descriptions.Item label={t('agent.endpointLabel')} span={3}>{finding.affected_endpoint || 'N/A'}</Descriptions.Item>
        {finding.parameter && <Descriptions.Item label={t('agent.vulnerableParameter')} span={3}>{finding.parameter}</Descriptions.Item>}
      </Descriptions>

      {finding.cvss_vector && <Alert type="info" showIcon message="CVSS Vector" description={<Text code>{finding.cvss_vector}</Text>} />}
      {finding.description && <Card size="small" title={t('agent.description')}><Paragraph>{finding.description}</Paragraph></Card>}
      {finding.evidence && <Card size="small" title={t('agent.evidenceLabel')}><Paragraph copyable>{finding.evidence}</Paragraph></Card>}
      {finding.payload && <Card size="small" title={t('agent.payloadUsed')} extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(finding.payload!)}>{t('agent.copy', 'Copy')}</Button>}><Paragraph code copyable>{finding.payload}</Paragraph></Card>}
      {finding.request && <Card size="small" title={t('agent.httpRequest')} extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(finding.request!)}>{t('agent.copy', 'Copy')}</Button>}><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{finding.request}</pre></Card>}
      {finding.response && <Card size="small" title={t('agent.httpResponseExcerpt')} extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(finding.response!)}>{t('agent.copy', 'Copy')}</Button>}><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{finding.response}</pre></Card>}
      {finding.impact && <Alert type="warning" showIcon message={t('agent.impact')} description={finding.impact} />}
      {finding.poc_code && <Card size="small" title={t('agent.proofOfConcept')} extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(finding.poc_code!)}>{t('agent.copy', 'Copy')}</Button>}><Paragraph code copyable={{ tooltips: [t('agent.copy', 'Copy'), t('agent.copied', 'Copied')] }}>{finding.poc_code}</Paragraph></Card>}
      {finding.proof_of_execution && <Alert type="success" showIcon message={t('agent.proofOfExecution')} description={finding.proof_of_execution} />}
      {finding.remediation && <Alert type="success" showIcon message={t('agent.remediation')} description={finding.remediation} />}
      {finding.confidence_breakdown && Object.keys(finding.confidence_breakdown).length > 0 && (
        <Card size="small" title={t('agent.confidenceBreakdown')}>
          <Descriptions size="small" column={{ xs: 2, sm: 3 }} bordered>
            {Object.entries(finding.confidence_breakdown).map(([key, value]) => (
              <Descriptions.Item key={key} label={key.replace(/_/g, ' ')}>
                <Text type={value > 0 ? 'success' : value < 0 ? 'danger' : 'secondary'}>
                  {value > 0 ? '+' : ''}{value}
                </Text>
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      )}
      {finding.references?.length > 0 && (
        <Card size="small" title={t('agent.references')}>
          <List
            size="small"
            dataSource={finding.references}
            renderItem={(ref) => (
              <List.Item>
                <Link href={ref} target="blank" copyable>
                  {(() => { try { return new URL(ref).hostname } catch { return ref } })()}
                </Link>
              </List.Item>
            )}
          />
        </Card>
      )}
    </Space>
  )
}, [copyToClipboard, t])

  if (isLoading) {
    return <PageContainer><ProCard><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.loading')} /></ProCard></PageContainer>
  }

  if (error) {
    return (
      <PageContainer>
        <Alert type="error" showIcon message={error} action={<Button onClick={() => navigate('/scan/new')}>{t('agent.startNewAgent')}</Button>} />
      </PageContainer>
    )
  }

  if (!status) return null

  const currentPhaseIndex = status.status === 'completed' ? 4 : getPhaseIndex(status.phase)
  const reportMenu = {
    items: [
      { key: 'html', icon: <FileTextOutlined />, label: t('agent.htmlReport') },
      { key: 'json', icon: <DownloadOutlined />, label: t('agent.jsonReport') },
      ...(status.scan_id ? [{ key: 'ai', icon: <ThunderboltOutlined />, label: t('agent.aiReport') }] : []),
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'ai') handleGenerateAiReport()
      else handleGenerateReport(key as 'json' | 'html')
    },
  }

  const canExport = status.findings.length > 0 || !!status.report
  const findingItems = status.findings.map(finding => ({
    key: finding.id,
    label: (
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        <Space wrap>
          <Tag color={severityColor[finding.severity]}>{finding.severity.toUpperCase()}</Tag>
          {finding.ai_verified && <Tag color="purple" icon={<RobotOutlined />}>{t('agent.aiVerified')}</Tag>}
          {typeof finding.confidence_score === 'number' && <Tag color={confidenceColor(finding.confidence_score)}>{finding.confidence_score}/100</Tag>}
          <Text strong>{finding.title}</Text>
        </Space>
        <Text type="secondary" ellipsis>{finding.affected_endpoint}</Text>
      </Space>
    ),
    children: renderFindingDetails(finding),
  }))

  return (
    <PageContainer
      title={<Space><RobotOutlined />{t('agent.agentHeading', { id: agentId })}</Space>}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh}>{t('common.refresh')}</Button>,
        status.status === 'running' && <Button key="pause" icon={<PauseCircleOutlined />} onClick={handlePauseScan}>{t('agent.pause')}</Button>,
        status.status === 'paused' && <Button key="resume" type="primary" icon={<PlayCircleOutlined />} onClick={handleResumeScan}>{t('agent.resume')}</Button>,
        (status.status === 'running' || status.status === 'paused') && (
          <Popconfirm key="stop" title={t('agent.stop')} onConfirm={handleStopScan} okButtonProps={{ loading: isStopping }}>
            <Button danger icon={<StopOutlined />}>{t('agent.stop')}</Button>
          </Popconfirm>
        ),
        status.scan_id && <Button key="scan" icon={<SafetyCertificateOutlined />} onClick={() => navigate(`/scan/${status.scan_id}`)}>{t('agent.viewInDashboard')}</Button>,
        canExport && <Dropdown key="report" menu={reportMenu} disabled={isGeneratingReport || isGeneratingAiReport}><Button type="primary" icon={<DownloadOutlined />} loading={isGeneratingReport || isGeneratingAiReport}>{t('agent.generateReport')}</Button></Dropdown>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {connectionLost && <Alert type="warning" showIcon icon={<WifiOutlined />} message={t('agent.connectionIssuesRetrying')} />}
        {status.error && <Alert type="error" showIcon message={t('agent.agentErrorTitle')} description={status.error} />}

        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: t('agent.target'), value: status.target, icon: <ApiOutlined /> }} />
          <StatisticCard statistic={{ title: t('agent.mode'), value: modeLabels[status.mode] || status.mode, icon: <BranchesOutlined /> }} />
          <StatisticCard statistic={{ title: t('agent.totalFindingsLabel'), value: status.findings_count, icon: <BugOutlined /> }} />
          <StatisticCard statistic={{ title: t('agent.status'), value: formatStatusLabel(status.status, t), icon: <Badge status={statusColor[status.status]} /> }} />
        </StatisticCard.Group>

        <ProCard bordered>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Row gutter={[16, 16]} align="middle">
              <Col flex="auto">
                <Space wrap>
                  <Tag color={statusColor[status.status]}>{formatStatusLabel(status.status, t)}</Tag>
                  <Text>{t('agent.phaseToast', { phase: status.phase.replace(/_/g, ' ') })}</Text>
                  {status.started_at && <Text type="secondary">{t('agent.started')} {relativeTime(status.started_at, t)}</Text>}
                  {status.task && <Text type="secondary">{t('agent.taskPrefix')} {status.task}</Text>}
                </Space>
              </Col>
              <Col><Text strong>{status.progress}%</Text></Col>
            </Row>
            <Progress percent={status.progress} status={status.status === 'error' ? 'exception' : status.status === 'completed' ? 'success' : 'active'} />
            <Steps
              current={currentPhaseIndex}
              items={scanPhases.map((phase, index) => ({
                title: skippedPhases.has(phase.key) ? t('agent.phaseSkipped', { label: phase.title }) : phase.title,
                icon: phase.icon,
                status: skippedPhases.has(phase.key) ? 'wait' : index < currentPhaseIndex || status.status === 'completed' ? 'finish' : index === currentPhaseIndex ? 'process' : 'wait',
                description: (status.status === 'running' || status.status === 'paused') && index > currentPhaseIndex && phase.key !== 'completed'
                  ? <Button size="small" type="link" onClick={() => { Modal.confirm({ title: t('agent.skipToConfirm', 'Skip Phase'), content: t('agent.skipToConfirmContent', { defaultValue: 'Are you sure you want to skip to {{label}}? This will skip all intermediate phases.', label: phase.title }), okText: t('agent.skipConfirm', 'Confirm'), cancelText: t('agent.cancel', 'Cancel'), onOk: () => handleSkipToPhase(phase.key), }) }}>{t('agent.skipToTooltip', { label: phase.title })}</Button>
                  : undefined,
              }))}
            />
          </Space>
        </ProCard>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={4}><ProCard bordered><StatisticCard statistic={{ title: t('agent.totalFindingsShort'), value: status.findings_count }} /></ProCard></Col>
          {SEVERITY_ORDER.map(severity => (
            <Col key={severity} xs={12} sm={6} md={4}><ProCard bordered><StatisticCard statistic={{ title: severity, value: severityCounts[severity], status: severity === 'critical' || severity === 'high' ? 'error' : severity === 'medium' ? 'warning' : 'default' }} /></ProCard></Col>
          ))}
        </Row>

        {status.status === 'running' && (
          <ProCard bordered title={<Space><RobotOutlined />{t('agent.customAiPromptTitle')}</Space>}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">{t('agent.customAiPromptHelp')}</Text>
              <TextArea value={customPrompt} onChange={event => setCustomPrompt(event.target.value)} placeholder={t('agent.customPromptPlaceholder')} autoSize={{ minRows: 2, maxRows: 5 }} onPressEnter={event => { if (!event.shiftKey) { event.preventDefault(); handleSubmitPrompt() } }} />
              <Button type="primary" icon={<SendOutlined />} loading={isSubmittingPrompt} disabled={!customPrompt.trim()} onClick={handleSubmitPrompt}>{t('agent.send')}</Button>
            </Space>
          </ProCard>
        )}

        <Tabs
          items={[
            {
              key: 'findings',
              label: `${t('agent.vulnsFoundTitle')} (${status.findings_count})`,
              children: status.findings.length ? <Collapse items={findingItems} /> : <Empty description={status.status === 'running' ? t('agent.scanningForVulns') : t('agent.noVulnsFound')} />,
            },
            {
              key: 'logs',
              label: t('agentStatus.logs'),
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Row justify="end"><Space><Text type="secondary">{t('agent.autoScrollLogs')}</Text><Switch checked={autoScroll} onChange={setAutoScroll} /></Space></Row>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                      <ProCard bordered title={<Space><CodeOutlined />{t('agent.scriptActivity')}<Tag>{scriptLogs.length}</Tag></Space>} subTitle={t('agent.scriptActivitySubtitle')}>
                        {renderLogViewer(scriptLogs, scriptLogsContainerRef, scriptStickRef, t('agent.logEmptyScript'), <CodeOutlined />)}
                      </ProCard>
                    </Col>
                    <Col xs={24} lg={12}>
                      <ProCard bordered title={<Space><RobotOutlined />{t('agent.aiAnalysis')}<Tag>{llmLogs.length}</Tag></Space>} subTitle={t('agent.aiAnalysisSubtitle')}>
                        {renderLogViewer(llmLogs, llmLogsContainerRef, llmStickRef, t('agent.logEmptyAi'), <RobotOutlined />)}
                      </ProCard>
                    </Col>
                  </Row>
                </Space>
              ),
            },
            {
              key: 'report',
              label: t('agent.reportSummary'),
              children: (status.report || status.findings.length > 0) ? (
                <ProCard bordered>
                  <Descriptions bordered column={{ xs: 1, md: 2 }}>
                    <Descriptions.Item label={t('agent.target')}>{status.report?.summary.target || status.target}</Descriptions.Item>
                    <Descriptions.Item label={t('agent.mode')}>{modeLabels[status.report?.summary.mode || status.mode] || status.mode}</Descriptions.Item>
                    <Descriptions.Item label={t('agent.duration')}>{status.report?.summary.duration || 'N/A'}</Descriptions.Item>
                    <Descriptions.Item label={t('agent.totalFindingsShort')}>{status.report?.summary.total_findings || status.findings.length}</Descriptions.Item>
                  </Descriptions>
                  {status.report?.executive_summary && <Alert style={{ marginTop: 16 }} type="info" showIcon message={t('agent.executiveSummaryHeading')} description={status.report.executive_summary} />}
                  {status.report?.recommendations?.length ? <Card style={{ marginTop: 16 }} title={t('agent.recommendations')}>{status.report.recommendations.map(item => <Paragraph key={item}>{item}</Paragraph>)}</Card> : null}
                </ProCard>
              ) : <Empty description={t('agentStatus.noFindings')} />,
            },
            {
              key: 'details',
              label: t('agentStatus.title'),
              children: (
                <Descriptions bordered column={{ xs: 1, md: 2 }}>
                  <Descriptions.Item label="Agent ID">{agentId}</Descriptions.Item>
                  <Descriptions.Item label="Scan ID">{status.scan_id || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label={t('agentStatus.startTime')}>{status.started_at ? new Date(status.started_at).toLocaleString() : 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Completed">{status.completed_at ? new Date(status.completed_at).toLocaleString() : 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Logs">{status.logs_count}</Descriptions.Item>
                  <Descriptions.Item label="Rejected">{status.rejected_findings_count || 0}</Descriptions.Item>
                  <Descriptions.Item label={t('autoPentest.containerLabel')}>{status.container_status ? (status.container_status.online ? t('autoPentest.online') : t('autoPentest.offline')) : 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Container ID">{status.container_status?.container_id || 'N/A'}</Descriptions.Item>
                </Descriptions>
              ),
            },
          ]}
        />
      </Space>
    </PageContainer>
  )
}
