export interface AppTestTask {
  id: string
  name: string
  assets_id?: string | null
  document_id?: string | null
  terminal_type: number
  terminal_type_name: string
  template_id?: string | null
  template_name?: string | null
  status: string
  progress: number
  score?: number | null
  file_name?: string | null
  file_size?: string | null
  md5?: string | null
  package_name?: string | null
  version?: string | null
  vuln_high: number
  vuln_mid: number
  vuln_low: number
  vuln_danger: number
  report_type?: string | null
  error_message?: string | null
  created_at: string
  updated_at: string
  completed_at?: string | null
  created_by?: string | null
}

export interface AppTestTaskSummary {
  id: string
  name: string
  terminal_type: number
  terminal_type_name: string
  template_name?: string | null
  status: string
  progress: number
  score?: number | null
  vuln_high: number
  vuln_mid: number
  vuln_low: number
  vuln_danger: number
  file_name?: string | null
  file_size?: string | null
  package_name?: string | null
  version?: string | null
  error_message?: string | null
  created_at: string
  completed_at?: string | null
  created_by?: string | null
}

export interface AppTestTaskCreate {
  name: string
  terminal_type: number
  template_id?: string | null
  template_name?: string | null
  callback?: boolean
  callback_url?: string | null
}

export interface AppTestStrategy {
  id?: number | null
  name: string
  template_id?: number | null
  terminal_type?: number | null
  terminal_type_name: string
  detection_item_count: number
  use_count: number
  status: number
  remark: string
  create_time?: string | null
}

export interface AppTestAsset {
  assets_id?: string | null
  name: string
  version: string
  package: string
  md5: string
  size: string
  terminal_type?: number | null
  terminal_type_name: string
  detection_count: number
  detection_score: string
  logo?: string | null
  create_time?: string | null
}

export interface AppTestVulnerability {
  id?: string | null
  detection_item_id?: string | null
  name: string
  purpose: string
  grade: string
  grade_value?: number | null
  harm: string
  solution: string
  result: string
  result_detail: string
  describe: string
  type_name: string
  detail_pre: string
  detection_item_type: string
  terminal_type?: number | null
  order_no?: number | null
  item_no?: string | null
  platform?: string | null
  is_dynamic: boolean
}

export interface AppTestConfig {
  base_url: string
  client_id: string
  client_secret: string
  username: string
  password: string
  connected: boolean
}

export interface AppTestConfigUpdate {
  base_url?: string | null
  client_id?: string | null
  client_secret?: string | null
  username?: string | null
  password?: string | null
}

export const TERMINAL_TYPE_OPTIONS = [
  { value: 1, label: 'Android', color: 'green' },
  { value: 2, label: 'iOS', color: 'blue' },
  { value: 3, label: '公众号', color: 'cyan' },
  { value: 4, label: '小程序', color: 'geekblue' },
  { value: 7, label: 'SDK', color: 'purple' },
  { value: 8, label: 'IoT', color: 'orange' },
  { value: 9, label: 'AAB', color: 'magenta' },
  { value: 10, label: '鸿蒙', color: 'red' },
  { value: 11, label: 'iOS SDK', color: 'blue' },
  { value: 12, label: 'H5', color: 'lime' },
  { value: 14, label: 'HarmonyOS', color: 'volcano' },
]

export const DETECTION_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待检测', color: 'default' },
  uploading: { label: '上传中', color: 'processing' },
  running: { label: '检测中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

export function getTerminalTypeLabel(value: number): string {
  return TERMINAL_TYPE_OPTIONS.find(o => o.value === value)?.label || `未知(${value})`
}

export function getTerminalTypeColor(value: number): string {
  return TERMINAL_TYPE_OPTIONS.find(o => o.value === value)?.color || 'default'
}

export function getStatusConfig(status: string): { label: string; color: string } {
  return DETECTION_STATUS_MAP[status] || { label: status, color: 'default' }
}

/** Format an ISO datetime string to local "YYYY-MM-DD HH:mm:ss". Returns '-' if empty/invalid. */
export function formatDateTime(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Score → antd color (success/warning/error). */
export function getScoreColor(score?: number | null): string {
  if (score === null || score === undefined) return 'default'
  if (score >= 80) return 'success'
  if (score >= 60) return 'warning'
  return 'error'
}

/** Grade string / value → antd color. iJiami grade value: 3=高 2=中 1=低. */
export function getGradeColor(grade?: string, gradeValue?: number | null): string {
  if (gradeValue === 3 || (grade && grade.includes('高'))) return 'error'
  if (gradeValue === 2 || (grade && grade.includes('中'))) return 'warning'
  return 'default'
}

// ---- Statistics ----
export interface AppTestStatOverview {
  app_num: number
  task_num: number
  version_num: number
  assets_num: number
  detection_num: number
  flaw_num: number
  flaw_high_num: number
  flaw_middle_num: number
  flaw_low_num: number
}

export interface AppTestStatTrend {
  date_list: string[]
  score_list: number[][]
  score_type: string[]
}

export interface AppTestStatRiskItem {
  name: string
  grade: string
  risk_num: number
  rate?: number | string | null
  type_name: string
}

export interface AppTestStatRiskType {
  name: string
  count: number
}

export interface AppTestStatistics {
  overview: AppTestStatOverview
  trend: AppTestStatTrend
  risk_top10: AppTestStatRiskItem[]
  risk_types: AppTestStatRiskType[]
}

// ---- Rich task detail ----
export interface AppTestBaseInfo {
  app_name: string
  package_name: string
  apk_size: string
  version_name: string
  apk_md5: string
  sign_md5: string
  sign_detail: string
  encrypt_detail: string
  manufacturer?: string | null
}

export interface AppTestPermission {
  permission_name: string
  permission_describe: string
  permission_grade: string
  permission_type?: string | null
  is_sensitive: string
  is_abuse: string
}

export interface AppTestSDK {
  name: string
  vendor: string
  descript: string
  type_name: string
  description: string
}

export interface AppTestAppAction {
  name: string
  action_function: string
  action_function_position: string
}

export interface AppTestTaskDetail {
  is_sdk_detection: number
  base_info: AppTestBaseInfo
  permissions: AppTestPermission[]
  sdks: AppTestSDK[]
  app_actions: AppTestAppAction[]
  item_types: string[]
  permission_count: number
  sdk_count: number
  sensitive_permission_count: number
}

// ---- Version history ----
export interface AppTestVersionScore {
  version: string
  score?: number | null
  create_time: string
}

export interface AppTestVersionRisk {
  app_name: string
  version: string
  apk_highrisk_count: number
  apk_middlerisk_count: number
  apk_lowrisk_count: number
  score?: number | null
  create_time: string
}

export interface AppTestVersionHistory {
  scores: AppTestVersionScore[]
  risks: AppTestVersionRisk[]
  versions: Record<string, unknown>[]
}
