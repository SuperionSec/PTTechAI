import type { ReactNode } from 'react'
import {
  DashboardOutlined,
  RobotOutlined,
  PlusCircleOutlined,
  ThunderboltOutlined,
  AimOutlined,
  ExperimentOutlined,
  CodeOutlined,
  CloudServerOutlined,
  BookOutlined,
  DatabaseOutlined,
  ApiOutlined,
  ScheduleOutlined,
  FileTextOutlined,
  TranslationOutlined,
  TeamOutlined,
  SettingOutlined,
  UserOutlined,
  KeyOutlined,
  SafetyCertificateOutlined,
  MenuOutlined,
  BugOutlined,
  LineChartOutlined,
} from '@ant-design/icons'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import HomePage from '../pages/HomePage'
import NewScanPage from '../pages/NewScanPage'
import ScanDetailsPage from '../pages/ScanDetailsPage'
import AgentStatusPage from '../pages/AgentStatusPage'
import TaskLibraryPage from '../pages/TaskLibraryPage'
import RealtimeTaskPage from '../pages/RealtimeTaskPage'
import ReportsPage from '../pages/ReportsPage'
import ReportViewPage from '../pages/ReportViewPage'
import SettingsPage from '../pages/SettingsPage'
import SchedulerPage from '../pages/SchedulerPage'
import AutoPentestPage from '../pages/AutoPentestPage'
import VulnLabPage from '../pages/VulnLabPage'
import TerminalAgentPage from '../pages/TerminalAgentPage'
import SandboxDashboardPage from '../pages/SandboxDashboardPage'
import KnowledgePage from '../pages/KnowledgePage'
import MCPManagementPage from '../pages/MCPManagementPage'
import ProvidersPage from '../pages/ProvidersPage'
import FullIATestingPage from '../pages/FullIATestingPage'
import {
  VulnerabilityArtifactsPage,
  VulnerabilityCategoriesPage,
  VulnerabilityEntriesPage,
  VulnerabilityIdentifiersPage,
  VulnerabilityLibraryOverviewPage,
} from '../pages/vulnerability-library'
import {
  APIKeysPage,
  AuditLogPage,
  LanguagesPage,
  MenuManagementPage,
  SystemMonitorPage,
  RoleManagementPage,
  UserManagementPage,
  UserProfilePage,
} from '../pages/system'
import {
  AppTestListPage,
  AppTestNewPage,
  AppTestDetailPage,
  AppTestReportsPage,
  AppTestStatisticsPage,
} from '../pages/apptest'
import NotFound from '../pages/Exception/NotFound'

export type RouteGroup = 'system' | 'pentest' | 'vulnerabilityLibrary' | 'apptest'

export interface AppRoute {
  path: string
  name: string
  element: ReactNode
  icon?: ReactNode
  access?: 'canAccessPage'
  permission?: string
  group?: RouteGroup
  hideInMenu?: boolean
  public?: boolean
}

export const appRoutes: AppRoute[] = [
  { path: '/login', name: 'auth.login', element: <LoginPage />, public: true, hideInMenu: true },
  { path: '/register', name: 'auth.register', element: <RegisterPage />, public: true, hideInMenu: true },
  { path: '/', name: 'sidebar.dashboard', element: <HomePage />, icon: <DashboardOutlined />, access: 'canAccessPage', permission: 'dashboard:read', group: 'pentest' },
  { path: '/auto', name: 'sidebar.autoPentest', element: <AutoPentestPage />, icon: <RobotOutlined />, access: 'canAccessPage', permission: 'agent:execute', group: 'pentest' },
  { path: '/scan/new', name: 'sidebar.aiAgent', element: <NewScanPage />, icon: <PlusCircleOutlined />, access: 'canAccessPage', permission: 'scan:create', group: 'pentest' },
  { path: '/realtime', name: 'sidebar.realtimeTask', element: <RealtimeTaskPage />, icon: <ThunderboltOutlined />, access: 'canAccessPage', permission: 'agent:execute', group: 'pentest' },
  { path: '/full-ia', name: 'sidebar.fullIaTesting', element: <FullIATestingPage />, icon: <AimOutlined />, access: 'canAccessPage', permission: 'agent:execute', group: 'pentest' },
  { path: '/vuln-lab', name: 'sidebar.vulnLab', element: <VulnLabPage />, icon: <ExperimentOutlined />, access: 'canAccessPage', permission: 'vulnerability:read', group: 'pentest' },
  { path: '/terminal', name: 'sidebar.terminalAgent', element: <TerminalAgentPage />, icon: <CodeOutlined />, access: 'canAccessPage', permission: 'agent:execute', group: 'pentest' },
  { path: '/sandboxes', name: 'sidebar.sandboxes', element: <SandboxDashboardPage />, icon: <CloudServerOutlined />, access: 'canAccessPage', permission: 'agent:execute', group: 'pentest' },
  { path: '/tasks', name: 'sidebar.taskLibrary', element: <TaskLibraryPage />, icon: <BookOutlined />, access: 'canAccessPage', permission: 'agent:read', group: 'pentest' },
  { path: '/knowledge', name: 'sidebar.knowledge', element: <KnowledgePage />, icon: <DatabaseOutlined />, access: 'canAccessPage', permission: 'knowledge:read', group: 'pentest' },
  { path: '/mcp', name: 'sidebar.mcpServers', element: <MCPManagementPage />, icon: <ApiOutlined />, access: 'canAccessPage', permission: 'settings:manage', group: 'pentest' },
  { path: '/providers', name: 'sidebar.providers', element: <ProvidersPage />, icon: <ApiOutlined />, access: 'canAccessPage', permission: 'provider:read', group: 'pentest' },
  { path: '/scheduler', name: 'sidebar.scheduler', element: <SchedulerPage />, icon: <ScheduleOutlined />, access: 'canAccessPage', permission: 'scheduler:read', group: 'pentest' },
  { path: '/reports', name: 'sidebar.reports', element: <ReportsPage />, icon: <FileTextOutlined />, access: 'canAccessPage', permission: 'report:read', group: 'pentest' },
  { path: '/apptest', name: 'sidebar.apptest', element: <AppTestListPage />, icon: <SafetyCertificateOutlined />, access: 'canAccessPage', permission: 'apptest:read', group: 'apptest' },
  { path: '/apptest/statistics', name: 'apptest.statistics', element: <AppTestStatisticsPage />, icon: <LineChartOutlined />, access: 'canAccessPage', permission: 'apptest:read', group: 'apptest' },
  { path: '/apptest/new', name: 'apptest.newTask', element: <AppTestNewPage />, icon: <PlusCircleOutlined />, access: 'canAccessPage', permission: 'apptest:execute', group: 'apptest', hideInMenu: true },
  { path: '/apptest/:taskId/report', name: 'apptest.reportDetail', element: <AppTestReportsPage />, access: 'canAccessPage', permission: 'apptest:read', group: 'apptest', hideInMenu: true },
  { path: '/apptest/:taskId', name: 'apptest.detail', element: <AppTestDetailPage />, access: 'canAccessPage', permission: 'apptest:read', group: 'apptest', hideInMenu: true },
  { path: '/vulnerability-library/overview', name: 'vulnerabilityLibrary.overview.title', element: <VulnerabilityLibraryOverviewPage />, icon: <DashboardOutlined />, access: 'canAccessPage', permission: 'vuln_library:read', group: 'vulnerabilityLibrary' },
  { path: '/vulnerability-library/entries', name: 'vulnerabilityLibrary.entries.title', element: <VulnerabilityEntriesPage />, icon: <BugOutlined />, access: 'canAccessPage', permission: 'vuln_library:read', group: 'vulnerabilityLibrary' },
  { path: '/vulnerability-library/artifacts', name: 'vulnerabilityLibrary.artifacts.title', element: <VulnerabilityArtifactsPage />, icon: <CodeOutlined />, access: 'canAccessPage', permission: 'vuln_library:read', group: 'vulnerabilityLibrary' },
  { path: '/vulnerability-library/identifiers', name: 'vulnerabilityLibrary.identifiers.title', element: <VulnerabilityIdentifiersPage />, icon: <DatabaseOutlined />, access: 'canAccessPage', permission: 'vuln_library:read', group: 'vulnerabilityLibrary' },
  { path: '/vulnerability-library/categories', name: 'vulnerabilityLibrary.categories.title', element: <VulnerabilityCategoriesPage />, icon: <MenuOutlined />, access: 'canAccessPage', permission: 'vuln_library:manage', group: 'vulnerabilityLibrary' },
  { path: '/reports/:reportId', name: 'pages.reportView', element: <ReportViewPage />, access: 'canAccessPage', permission: 'report:read', hideInMenu: true },
  { path: '/scan/:scanId', name: 'pages.scanDetails', element: <ScanDetailsPage />, access: 'canAccessPage', permission: 'scan:read', hideInMenu: true },
  { path: '/agent/:agentId', name: 'pages.agentStatus', element: <AgentStatusPage />, access: 'canAccessPage', permission: 'agent:read', hideInMenu: true },
  { path: '/users', name: 'usersManagement.title', element: <UserManagementPage />, icon: <TeamOutlined />, access: 'canAccessPage', permission: 'user:manage', group: 'system' },
  { path: '/roles', name: 'roleManagement.title', element: <RoleManagementPage />, icon: <SafetyCertificateOutlined />, access: 'canAccessPage', permission: 'user:manage', group: 'system' },
  { path: '/menus', name: 'menuManagement.title', element: <MenuManagementPage />, icon: <MenuOutlined />, access: 'canAccessPage', permission: 'settings:manage', group: 'system' },
  { path: '/audit', name: 'audit.title', element: <AuditLogPage />, icon: <FileTextOutlined />, access: 'canAccessPage', permission: 'settings:manage', group: 'system' },
  { path: '/monitor', name: 'monitor.title', element: <SystemMonitorPage />, icon: <DashboardOutlined />, access: 'canAccessPage', permission: 'settings:manage', group: 'system' },

  { path: '/languages', name: 'languageManagement.title', element: <LanguagesPage />, icon: <TranslationOutlined />, access: 'canAccessPage', permission: 'settings:read', group: 'system' },
  { path: '/settings', name: 'sidebar.settings', element: <SettingsPage />, icon: <SettingOutlined />, access: 'canAccessPage', permission: 'settings:read', group: 'pentest' },
  { path: '/api-keys', name: 'apiKeys.title', element: <APIKeysPage />, icon: <KeyOutlined />, access: 'canAccessPage', permission: 'api_key:read', hideInMenu: true },
  { path: '/profile', name: 'profile.title', element: <UserProfilePage />, icon: <UserOutlined />, access: 'canAccessPage', hideInMenu: true },
  { path: '*', name: 'pages.notFound', element: <NotFound />, public: true, hideInMenu: true },
]

export const menuRoutes = appRoutes.filter(route => !route.hideInMenu && !route.public)
