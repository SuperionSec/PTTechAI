import { ReactNode, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ConfigProvider, Dropdown, Space, Spin, theme, App as AntApp } from 'antd'
import type { MenuProps } from 'antd'
import { ProLayout } from '@ant-design/pro-components'
import { GlobalOutlined, LogoutOutlined, SafetyCertificateOutlined, SettingOutlined, UserOutlined, BugOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import i18n from '../locales'
import { useAuth } from '../contexts/AuthContext'
import { canAccessPage, hasPermission } from '../routes/access'
import { appRoutes, menuRoutes } from '../routes/routeConfig'
import { buildMenuRoutes, type ProLayoutRoute } from '../utils/menuHelper'

interface ProAppLayoutProps {
  children: ReactNode
}

/** Recursively translate route names (i18n keys) using t() */
function translateRoutes(routes: ProLayoutRoute[], t: (key: string) => string): ProLayoutRoute[] {
  return routes.map(r => ({
    ...r,
    name: t(r.name),
    routes: r.routes ? translateRoutes(r.routes, t) : undefined,
  }))
}

export default function ProAppLayout({ children }: ProAppLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, userPermissions, loading, logout } = useAuth()

  const routes = useMemo(() => {
    const permCtx = {
      role: userPermissions?.role || user?.role,
      permissions: userPermissions?.permissions,
      frontendPages: userPermissions?.frontend_pages,
    }

    // Priority 1: Use backend menus (dynamic config takes effect)
    if (userPermissions?.menus?.length) {
      const menuTree = buildMenuRoutes(userPermissions.menus, appRoutes)
      return translateRoutes(menuTree, t)
    }

    // Fallback: Hardcoded group logic (when backend menus not initialized)
    const accessibleRoutes = menuRoutes.filter(route => canAccessPage(permCtx, route.path, route.permission))

    const systemRoutes = accessibleRoutes
      .filter(route => route.group === 'system')
      .map(route => ({ path: route.path, name: t(route.name), icon: route.icon }))

    const vulnerabilityLibraryRoutes = accessibleRoutes
      .filter(route => route.group === 'vulnerabilityLibrary')
      .map(route => ({ path: route.path, name: t(route.name), icon: route.icon }))

    const pentestRoutes = accessibleRoutes
      .filter(route => route.group === 'pentest')
      .map(route => ({ path: route.path, name: t(route.name), icon: route.icon }))

    return [
      {
        path: '/system-setting-group',
        name: t('sidebar.systemSettings'),
        icon: <SettingOutlined />,
        routes: systemRoutes,
      },
      {
        path: '/vulnerability-library-group',
        name: t('sidebar.vulnerabilityLibrary'),
        icon: <SafetyCertificateOutlined />,
        routes: vulnerabilityLibraryRoutes,
      },
      {
        path: '/penetration-testing-group',
        name: t('sidebar.penetrationTesting'),
        icon: <BugOutlined />,
        routes: pentestRoutes,
      }
    ].filter(route => route.routes.length > 0)
  }, [t, user?.role, userPermissions])

  const canAccessApiTokens = canAccessPage({
    role: userPermissions?.role || user?.role,
    permissions: userPermissions?.permissions,
    frontendPages: userPermissions?.frontend_pages,
  }, '/api-keys', 'api_key:read') || hasPermission({
    role: userPermissions?.role || user?.role,
    permissions: userPermissions?.permissions,
  }, 'api_key:read')

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: t('profile.title', 'Profile'),
    },
    ...(canAccessApiTokens ? [{
      key: 'api-keys',
      icon: <SettingOutlined />,
      label: t('apiKeys.title', 'My API Tokens'),
    }] : []),
    {
      key: 'language',
      icon: <GlobalOutlined />,
      label: i18n.language === 'zh-CN' ? 'English' : '中文',
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('auth.logout', 'Logout'),
      danger: true,
    },
  ]

  const onUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'profile') {
      navigate('/profile')
      return
    }
    if (key === 'api-keys') {
      navigate('/api-keys')
      return
    }
    if (key === 'language') {
      i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN')
      return
    }
    if (key === 'logout') {
      logout()
      navigate('/login')
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
        },
      }}
    >
      <AntApp>
        <ProLayout
          title="PTTechAI"
          logo={<SafetyCertificateOutlined style={{ color: '#1677ff', fontSize: 24 }} />}
          layout="mix"
          navTheme="light"
          fixedHeader
          fixSiderbar
          contentWidth="Fluid"
          location={{ pathname: location.pathname }}
          route={{ path: '/', routes }}
          menuItemRender={(item, dom) => {
            const content = item.parentKeys?.length && item.icon ? (
              <Space size={8}>
                {item.icon}
                <span>{dom}</span>
              </Space>
            ) : dom
            return item.children ? content : item.path ? <Link to={item.path}>{content}</Link> : content
          }}
          avatarProps={user ? {
            icon: <UserOutlined />,
            title: user.full_name || user.email,
            render: (_, dom) => (
              <Dropdown menu={{ items: userMenuItems, onClick: onUserMenuClick }} trigger={['click']}>
                <Space style={{ cursor: 'pointer' }}>{dom}</Space>
              </Dropdown>
            ),
          } : undefined}
          actionsRender={() => [
            <GlobalOutlined key="language" onClick={() => i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN')} />,
          ]}
          menuFooterRender={() => (
            <div style={{ color: '#52c41a', fontSize: 12, paddingInline: 16, paddingBlock: 8 }}>
              {t('sidebar.systemOnline', 'System Online')}
            </div>
          )}
        >
          <div style={{ minHeight: 'calc(100vh - 56px)' }}>
            {children}
          </div>
        </ProLayout>
      </AntApp>
    </ConfigProvider>
  )
}
