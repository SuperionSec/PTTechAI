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
  UserSwitchOutlined,
  SettingOutlined,
  UserOutlined,
  KeyOutlined,
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
import UserManagementPage from '../pages/UserManagementPage'
import UserProfilePage from '../pages/UserProfilePage'
import LanguagesPage from '../pages/LanguagesPage'
import RoleManagementPage from '../pages/RoleManagementPage'
import UnmappedResourcesPage from '../pages/UnmappedResourcesPage'
import APIKeysPage from '../pages/APIKeysPage'
import NotFound from '../pages/Exception/NotFound'

export interface AppRoute {
  path: string
  name: string
  element: ReactNode
  icon?: ReactNode
  permission?: string
  hideInMenu?: boolean
  public?: boolean
}

export const appRoutes: AppRoute[] = [
  { path: '/login', name: 'auth.login', element: <LoginPage />, public: true, hideInMenu: true },
  { path: '/register', name: 'auth.register', element: <RegisterPage />, public: true, hideInMenu: true },
  { path: '/', name: 'sidebar.dashboard', element: <HomePage />, icon: <DashboardOutlined />, permission: 'dashboard:read' },
  { path: '/auto', name: 'sidebar.autoPentest', element: <AutoPentestPage />, icon: <RobotOutlined />, permission: 'agent:execute' },
  { path: '/scan/new', name: 'sidebar.aiAgent', element: <NewScanPage />, icon: <PlusCircleOutlined />, permission: 'scan:create' },
  { path: '/realtime', name: 'sidebar.realtimeTask', element: <RealtimeTaskPage />, icon: <ThunderboltOutlined />, permission: 'agent:execute' },
  { path: '/full-ia', name: 'sidebar.fullIaTesting', element: <FullIATestingPage />, icon: <AimOutlined />, permission: 'agent:execute' },
  { path: '/vuln-lab', name: 'sidebar.vulnLab', element: <VulnLabPage />, icon: <ExperimentOutlined />, permission: 'vulnerability:read' },
  { path: '/terminal', name: 'sidebar.terminalAgent', element: <TerminalAgentPage />, icon: <CodeOutlined />, permission: 'agent:execute' },
  { path: '/sandboxes', name: 'sidebar.sandboxes', element: <SandboxDashboardPage />, icon: <CloudServerOutlined />, permission: 'agent:execute' },
  { path: '/tasks', name: 'sidebar.taskLibrary', element: <TaskLibraryPage />, icon: <BookOutlined />, permission: 'agent:read' },
  { path: '/knowledge', name: 'sidebar.knowledge', element: <KnowledgePage />, icon: <DatabaseOutlined />, permission: 'knowledge:read' },
  { path: '/mcp', name: 'sidebar.mcpServers', element: <MCPManagementPage />, icon: <ApiOutlined />, permission: 'settings:manage' },
  { path: '/providers', name: 'sidebar.providers', element: <ProvidersPage />, icon: <ApiOutlined />, permission: 'provider:read' },
  { path: '/scheduler', name: 'sidebar.scheduler', element: <SchedulerPage />, icon: <ScheduleOutlined />, permission: 'scheduler:read' },
  { path: '/reports', name: 'sidebar.reports', element: <ReportsPage />, icon: <FileTextOutlined />, permission: 'report:read' },
  { path: '/reports/:reportId', name: 'pages.reportView', element: <ReportViewPage />, permission: 'report:read', hideInMenu: true },
  { path: '/scan/:scanId', name: 'pages.scanDetails', element: <ScanDetailsPage />, permission: 'scan:read', hideInMenu: true },
  { path: '/agent/:agentId', name: 'pages.agentStatus', element: <AgentStatusPage />, permission: 'agent:read', hideInMenu: true },
  { path: '/languages', name: 'languageManagement.title', element: <LanguagesPage />, icon: <TranslationOutlined />, permission: 'settings:read' },
  { path: '/users', name: 'usersManagement.title', element: <UserManagementPage />, icon: <TeamOutlined />, permission: 'user:manage' },
  { path: '/roles', name: 'roleManagement.title', element: <RoleManagementPage />, icon: <UserSwitchOutlined />, permission: 'user:manage' },
  { path: '/unmapped-resources', name: 'roleManagement.unmappedResources', element: <UnmappedResourcesPage />, icon: <UserSwitchOutlined />, permission: 'user:manage' },
  { path: '/settings', name: 'sidebar.settings', element: <SettingsPage />, icon: <SettingOutlined />, permission: 'settings:read' },
  { path: '/api-keys', name: 'apiKeys.title', element: <APIKeysPage />, icon: <KeyOutlined /> },
  { path: '/profile', name: 'profile.title', element: <UserProfilePage />, icon: <UserOutlined /> },
  { path: '*', name: 'pages.notFound', element: <NotFound />, public: true, hideInMenu: true },
]

export const menuRoutes = appRoutes.filter(route => !route.hideInMenu && !route.public)
