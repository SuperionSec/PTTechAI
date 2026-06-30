/**
 * Menu Helper: Convert backend menu tree to ProLayout route data
 *
 * Core logic: backend menus control "visibility", routeConfig provides "components"
 */
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
  RocketOutlined,
  ToolOutlined,
  UserSwitchOutlined,
  LineChartOutlined,
} from '@ant-design/icons'
import type { AppRoute } from '../routes/routeConfig'

/** Backend menu node from /api/v1/system/me or /api/v1/menus/user */
export interface MenuNode {
  path: string
  name: string
  menu_type?: string
  icon?: string | null
  permission?: string | null
  locale?: string | null
  access?: string | null
  children?: MenuNode[]
}

/** ProLayout route item used by ProAppLayout */
export interface ProLayoutRoute {
  path: string
  name: string
  icon?: ReactNode
  routes?: ProLayoutRoute[]
}

/** Icon name string -> React component mapping */
const ICON_MAP: Record<string, ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  RobotOutlined: <RobotOutlined />,
  PlusCircleOutlined: <PlusCircleOutlined />,
  ThunderboltOutlined: <ThunderboltOutlined />,
  AimOutlined: <AimOutlined />,
  ExperimentOutlined: <ExperimentOutlined />,
  CodeOutlined: <CodeOutlined />,
  CloudServerOutlined: <CloudServerOutlined />,
  BookOutlined: <BookOutlined />,
  DatabaseOutlined: <DatabaseOutlined />,
  ApiOutlined: <ApiOutlined />,
  ScheduleOutlined: <ScheduleOutlined />,
  FileTextOutlined: <FileTextOutlined />,
  TranslationOutlined: <TranslationOutlined />,
  TeamOutlined: <TeamOutlined />,
  SettingOutlined: <SettingOutlined />,
  UserOutlined: <UserOutlined />,
  KeyOutlined: <KeyOutlined />,
  SafetyCertificateOutlined: <SafetyCertificateOutlined />,
  MenuOutlined: <MenuOutlined />,
  BugOutlined: <BugOutlined />,
  RocketOutlined: <RocketOutlined />,
  ToolOutlined: <ToolOutlined />,
  UserSwitchOutlined: <UserSwitchOutlined />,
  LineChartOutlined: <LineChartOutlined />,
}

function getIcon(iconName?: string | null): ReactNode | undefined {
  if (!iconName) return undefined
  return ICON_MAP[iconName]
}

/**
 * Convert backend menu tree to ProLayout route data.
 *
 * - `button` type menus are excluded (permission check only, not navigation)
 * - `directory` type menus become parent groups
 * - `menu` type menus become leaf items with links
 * - Icon from backend takes priority; falls back to routeConfig icon
 */
export function buildMenuRoutes(
  backendMenus: MenuNode[],
  allRoutes: AppRoute[],
): ProLayoutRoute[] {
  // Build path -> AppRoute map for icon fallback
  const routeMap = new Map<string, AppRoute>()
  for (const r of allRoutes) {
    routeMap.set(r.path, r)
  }

  function convert(nodes: MenuNode[]): ProLayoutRoute[] {
    return nodes
      .filter(n => n.menu_type !== 'button')
      .map(node => {
        const route = node.path ? routeMap.get(node.path) : undefined
        const children = node.children?.length ? convert(node.children) : undefined
        const icon = getIcon(node.icon) ?? route?.icon

        return {
          path: node.path || `/${node.name}-group`,
          name: node.name,
          icon,
          routes: children,
        }
      })
      .filter(r => r.routes?.length || routeMap.has(r.path))
  }

  return convert(backendMenus)
}
