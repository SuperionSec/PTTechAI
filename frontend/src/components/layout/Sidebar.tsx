import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AimOutlined,
  ApiOutlined,
  BookOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  CodeOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  GlobalOutlined,
  HomeOutlined,
  LeftOutlined,
  PlayCircleOutlined,
  RightOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  TranslationOutlined,
  UsergroupAddOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import { useAuth } from '../../contexts/AuthContext'
import { useUIStore } from '../../store'

interface NavItem {
  path: string
  icon: React.ElementType
  labelKey: string
  requiredPermission?: string
}

interface NavGroup {
  labelKey: string
  items: NavItem[]
}

const allNavGroups: NavGroup[] = [
  {
    labelKey: 'sidebar.operations',
    items: [
      { path: '/', icon: HomeOutlined, labelKey: 'sidebar.dashboard', requiredPermission: 'dashboard:read' },
      { path: '/auto', icon: PlayCircleOutlined, labelKey: 'sidebar.autoPentest', requiredPermission: 'agent:execute' },
      { path: '/scan/new', icon: RobotOutlined, labelKey: 'sidebar.aiAgent', requiredPermission: 'scan:create' },
      { path: '/realtime', icon: ThunderboltOutlined, labelKey: 'sidebar.realtimeTask', requiredPermission: 'agent:execute' },
      { path: '/full-ia', icon: AimOutlined, labelKey: 'sidebar.fullIaTesting', requiredPermission: 'full_ia:read' },
    ],
  },
  {
    labelKey: 'sidebar.tools',
    items: [
      { path: '/vuln-lab', icon: ExperimentOutlined, labelKey: 'sidebar.vulnLab', requiredPermission: 'vulnerability:read' },
      { path: '/terminal', icon: CodeOutlined, labelKey: 'sidebar.terminalAgent', requiredPermission: 'terminal:execute' },
      { path: '/sandboxes', icon: CloudServerOutlined, labelKey: 'sidebar.sandboxes', requiredPermission: 'sandbox:read' },
      { path: '/tasks', icon: BookOutlined, labelKey: 'sidebar.taskLibrary', requiredPermission: 'agent:read' },
      { path: '/knowledge', icon: BulbOutlined, labelKey: 'sidebar.knowledge', requiredPermission: 'knowledge:read' },
      { path: '/mcp', icon: ApiOutlined, labelKey: 'sidebar.mcpServers', requiredPermission: 'mcp:read' },
      { path: '/providers', icon: GlobalOutlined, labelKey: 'sidebar.providers', requiredPermission: 'provider:read' },
    ],
  },
  {
    labelKey: 'sidebar.configuration',
    items: [
      { path: '/scheduler', icon: ClockCircleOutlined, labelKey: 'sidebar.scheduler', requiredPermission: 'scheduler:read' },
      { path: '/reports', icon: FileTextOutlined, labelKey: 'sidebar.reports', requiredPermission: 'report:read' },
      { path: '/languages', icon: TranslationOutlined, labelKey: 'languageManagement.title', requiredPermission: 'settings:read' },
      { path: '/users', icon: UsergroupAddOutlined, labelKey: 'usersManagement.title', requiredPermission: 'user:manage' },
      { path: '/roles', icon: UserSwitchOutlined, labelKey: 'roleManagement.title', requiredPermission: 'user:manage' },
      { path: '/settings', icon: SettingOutlined, labelKey: 'sidebar.settings', requiredPermission: 'settings:read' },
    ],
  },
]

export default function Sidebar() {
  const location = useLocation()
  const { user, canAccessPage } = useAuth()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const { t } = useTranslation()

  // Filter nav groups based on user permissions
  const filteredNavGroups = allNavGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      // If no permission required, show it
      if (!item.requiredPermission) return true
      // Check if user can access the page
      return canAccessPage(item.path)
    })
  })).filter(group => group.items.length > 0)

  // Service accounts cannot access frontend pages
  if (user?.role === 'service') {
    return null
  }

  return (
    <aside
      className={`${
        sidebarCollapsed ? 'w-16' : 'w-64'
      } bg-dark-800 border-r border-dark-900/50 flex flex-col transition-all duration-300 ease-in-out flex-shrink-0`}
    >
      <div className={`border-b border-dark-900/50 ${sidebarCollapsed ? 'p-3' : 'p-4'}`}>
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <SafetyCertificateOutlined className="w-6 h-6 text-white" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white truncate">{t('sidebar.title')}</h1>
                <p className="text-xs text-dark-400">{t('sidebar.subtitle')}</p>
              </div>
            )}
          </Link>
          <button
            onClick={toggleSidebar}
            className="text-dark-400 hover:text-white transition-colors p-1 rounded hover:bg-dark-700 flex-shrink-0"
          >
            {sidebarCollapsed ? <RightOutlined className="w-4 h-4" /> : <LeftOutlined className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <nav className="flex-1 p-2 overflow-y-auto overflow-x-hidden">
        {filteredNavGroups.map((group) => (
          <div key={group.labelKey} className="mb-3">
            {!sidebarCollapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase text-dark-500 tracking-wider">
                {t(group.labelKey)}
              </p>
            )}
            {sidebarCollapsed && <div className="border-t border-dark-700/50 mx-2 mb-2 mt-1" />}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location.pathname === item.path
                const Icon = item.icon
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      title={sidebarCollapsed ? t(item.labelKey) : undefined}
                      className={`flex items-center ${
                        sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'
                      } py-2.5 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-primary-500/20 text-primary-500'
                          : 'text-dark-300 hover:bg-dark-900/50 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {!sidebarCollapsed && (
                        <span className="whitespace-nowrap text-sm">{t(item.labelKey)}</span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-dark-900/50">
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2'} text-sm`}>
          <DashboardOutlined className="w-4 h-4 text-green-500 flex-shrink-0" />
          {!sidebarCollapsed && <span className="text-dark-400">{t('sidebar.systemOnline')}</span>}
        </div>
      </div>
    </aside>
  )
}
