import { useAuth } from '../contexts/AuthContext'

/**
 * Ant Design Pro compatible access hook.
 * Returns a typed access map for fine-grained permission checks in UI components.
 *
 * Usage:
 *   const access = useAccess()
 *   if (access.canScanCreate) { ... }
 *   <Button disabled={!access.canSettingsManage}>Save</Button>
 */
export interface AccessMap {
  // Dashboard
  canDashboardRead: boolean
  // Scan
  canScanCreate: boolean
  canScanRead: boolean
  canScanUpdate: boolean
  canScanDelete: boolean
  canScanExecute: boolean
  // Target
  canTargetRead: boolean
  canTargetCreate: boolean
  canTargetDelete: boolean
  // Report
  canReportRead: boolean
  canReportCreate: boolean
  // Agent
  canAgentRead: boolean
  canAgentExecute: boolean
  // Vulnerability
  canVulnerabilityRead: boolean
  // Vulnerability Library
  canVulnLibraryRead: boolean
  canVulnLibraryCreate: boolean
  canVulnLibraryUpdate: boolean
  canVulnLibraryDelete: boolean
  canVulnLibraryManage: boolean
  // Settings & User
  canUserManage: boolean
  canUserRead: boolean
  canSettingsRead: boolean
  canSettingsManage: boolean
  // Organization / Tenant
  canTenantManage: boolean
  canOrgRead: boolean
  canOrgManage: boolean
  // API Key
  canApiKeyRead: boolean
  canApiKeyCreate: boolean
  canApiKeyDelete: boolean
  // Scheduler / Knowledge / Provider
  canSchedulerRead: boolean
  canSchedulerManage: boolean
  canKnowledgeRead: boolean
  canProviderRead: boolean
  canProviderManage: boolean
}

const DEFAULT_ACCESS: AccessMap = {
  canDashboardRead: false,
  canScanCreate: false,
  canScanRead: false,
  canScanUpdate: false,
  canScanDelete: false,
  canScanExecute: false,
  canTargetRead: false,
  canTargetCreate: false,
  canTargetDelete: false,
  canReportRead: false,
  canReportCreate: false,
  canAgentRead: false,
  canAgentExecute: false,
  canVulnerabilityRead: false,
  canVulnLibraryRead: false,
  canVulnLibraryCreate: false,
  canVulnLibraryUpdate: false,
  canVulnLibraryDelete: false,
  canVulnLibraryManage: false,
  canUserManage: false,
  canUserRead: false,
  canSettingsRead: false,
  canSettingsManage: false,
  canTenantManage: false,
  canOrgRead: false,
  canOrgManage: false,
  canApiKeyRead: false,
  canApiKeyCreate: false,
  canApiKeyDelete: false,
  canSchedulerRead: false,
  canSchedulerManage: false,
  canKnowledgeRead: false,
  canProviderRead: false,
  canProviderManage: false,
}

export function useAccess(): AccessMap {
  const { access } = useAuth()
  if (!access || Object.keys(access).length === 0) {
    return DEFAULT_ACCESS
  }
  return {
    canDashboardRead: access.canDashboardRead ?? false,
    canScanCreate: access.canScanCreate ?? false,
    canScanRead: access.canScanRead ?? false,
    canScanUpdate: access.canScanUpdate ?? false,
    canScanDelete: access.canScanDelete ?? false,
    canScanExecute: access.canScanExecute ?? false,
    canTargetRead: access.canTargetRead ?? false,
    canTargetCreate: access.canTargetCreate ?? false,
    canTargetDelete: access.canTargetDelete ?? false,
    canReportRead: access.canReportRead ?? false,
    canReportCreate: access.canReportCreate ?? false,
    canAgentRead: access.canAgentRead ?? false,
    canAgentExecute: access.canAgentExecute ?? false,
    canVulnerabilityRead: access.canVulnerabilityRead ?? false,
    canVulnLibraryRead: access.canVulnLibraryRead ?? false,
    canVulnLibraryCreate: access.canVulnLibraryCreate ?? false,
    canVulnLibraryUpdate: access.canVulnLibraryUpdate ?? false,
    canVulnLibraryDelete: access.canVulnLibraryDelete ?? false,
    canVulnLibraryManage: access.canVulnLibraryManage ?? false,
    canUserManage: access.canUserManage ?? false,
    canUserRead: access.canUserRead ?? false,
    canSettingsRead: access.canSettingsRead ?? false,
    canSettingsManage: access.canSettingsManage ?? false,
    canTenantManage: access.canTenantManage ?? false,
    canOrgRead: access.canOrgRead ?? false,
    canOrgManage: access.canOrgManage ?? false,
    canApiKeyRead: access.canApiKeyRead ?? false,
    canApiKeyCreate: access.canApiKeyCreate ?? false,
    canApiKeyDelete: access.canApiKeyDelete ?? false,
    canSchedulerRead: access.canSchedulerRead ?? false,
    canSchedulerManage: access.canSchedulerManage ?? false,
    canKnowledgeRead: access.canKnowledgeRead ?? false,
    canProviderRead: access.canProviderRead ?? false,
    canProviderManage: access.canProviderManage ?? false,
  }
}
