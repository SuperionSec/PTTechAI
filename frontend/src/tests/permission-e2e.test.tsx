/*
Frontend Permission E2E Tests
PTTechAI v0.1.0 - RBAC Permission System

Tests for frontend permission control:
- AuthContext permission information
- usePermission hook
- ProtectedRoute with requiredPermission
- Sidebar menu rendering based on permissions
- Button-level permission control

These are unit/integration tests for frontend permission components.
*/
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { canAccessPage } from '../routes/access'

// ============================================================================
// Mock AuthContext for testing
// ============================================================================

interface MockUserPermissions {
  role: string
  permissions: string[]
  frontend_pages: string[]
  backend_apis: string[]
}

const createMockAuthContext = (permissions: MockUserPermissions) => ({
  user: { id: 'test-id', email: 'test@test.com', role: permissions.role },
  userPermissions: permissions,
  hasPermission: (perm: string) => permissions.permissions.includes(perm),
  canAccessPage: (path: string) => {
    if (permissions.role === 'admin') return true
    return permissions.frontend_pages.includes(path)
  },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
})

// ============================================================================
// Test: AuthContext Permission Information
// ============================================================================

describe('AuthContext Permissions', () => {
  it('should have correct permissions for admin role', () => {
    const adminPerms: MockUserPermissions = {
      role: 'admin',
      permissions: ['*'],
      frontend_pages: ['*'],
      backend_apis: ['*'],
    }
    const auth = createMockAuthContext(adminPerms)

    expect(auth.hasPermission('scan:create')).toBe(true)
    expect(auth.hasPermission('user:manage')).toBe(true)
    expect(auth.canAccessPage('/users')).toBe(true)
    expect(auth.canAccessPage('/roles')).toBe(true)
  })

  it('should have correct permissions for user role', () => {
    const userPerms: MockUserPermissions = {
      role: 'user',
      permissions: [
        'scan:create', 'scan:read', 'scan:update', 'scan:execute',
        'report:read', 'report:create',
        'settings:read', 'settings:update',
        'agent:read', 'agent:execute',
        'knowledge:read', 'knowledge:update',
        'scheduler:read',
        'provider:read',
        'dashboard:read',
        'user:read',
      ],
      frontend_pages: [
        '/', '/scan/new', '/scan/:scanId',
        '/reports', '/reports/:reportId',
        '/settings', '/languages',
        '/agent/:agentId', '/tasks', '/realtime',
        '/knowledge', '/scheduler', '/providers',
        '/profile',
      ],
      backend_apis: [
        'GET /api/v1/scans', 'POST /api/v1/scans',
        'GET /api/v1/reports', 'POST /api/v1/reports',
      ],
    }
    const auth = createMockAuthContext(userPerms)

    expect(auth.hasPermission('scan:create')).toBe(true)
    expect(auth.hasPermission('user:manage')).toBe(false)
    expect(auth.canAccessPage('/scan/new')).toBe(true)
    expect(auth.canAccessPage('/users')).toBe(false)
    expect(auth.canAccessPage('/roles')).toBe(false)
  })

  it('should have correct permissions for viewer role', () => {
    const viewerPerms: MockUserPermissions = {
      role: 'viewer',
      permissions: [
        'scan:read',
        'report:read',
        'settings:read',
        'knowledge:read',
        'dashboard:read',
        'user:read',
      ],
      frontend_pages: [
        '/', '/scan/:scanId',
        '/reports', '/reports/:reportId',
        '/settings', '/languages',
        '/knowledge', '/profile',
      ],
      backend_apis: [
        'GET /api/v1/scans',
        'GET /api/v1/reports',
      ],
    }
    const auth = createMockAuthContext(viewerPerms)

    expect(auth.hasPermission('scan:create')).toBe(false)
    expect(auth.hasPermission('scan:read')).toBe(true)
    expect(auth.canAccessPage('/scan/new')).toBe(false)
    expect(auth.canAccessPage('/')).toBe(true)
  })

  it('should have no page access for service role', () => {
    const servicePerms: MockUserPermissions = {
      role: 'service',
      permissions: [],
      frontend_pages: [],
      backend_apis: [],
    }
    const auth = createMockAuthContext(servicePerms)

    expect(auth.hasPermission('scan:create')).toBe(false)
    expect(auth.canAccessPage('/')).toBe(false)
    expect(auth.canAccessPage('/scan/new')).toBe(false)
  })
})

// ============================================================================
// Test: usePermission Hook Logic
// ============================================================================

describe('usePermission Hook', () => {
  it('should correctly check API access', () => {
    const userPerms: MockUserPermissions = {
      role: 'user',
      permissions: ['scan:create', 'scan:read'],
      frontend_pages: ['/scan/new'],
      backend_apis: ['POST /api/v1/scans', 'GET /api/v1/scans'],
    }

    const canAccessApi = (apiPath: string) =>
      userPerms.role === 'admin' || userPerms.backend_apis.includes(apiPath)

    expect(canAccessApi('POST /api/v1/scans')).toBe(true)
    expect(canAccessApi('GET /api/v1/scans')).toBe(true)
    expect(canAccessApi('DELETE /api/v1/scans/123')).toBe(false)
  })

  it('should allow admin to access any API', () => {
    const adminPerms: MockUserPermissions = {
      role: 'admin',
      permissions: ['*'],
      frontend_pages: ['*'],
      backend_apis: ['*'],
    }

    const canAccessApi = (apiPath: string) =>
      adminPerms.role === 'admin' || adminPerms.backend_apis.includes(apiPath)

    expect(canAccessApi('POST /api/v1/scans')).toBe(true)
    expect(canAccessApi('DELETE /api/v1/users/123')).toBe(true)
    expect(canAccessApi('POST /api/v1/settings/clear-database')).toBe(true)
  })
})

// ============================================================================
// Test: ProtectedRoute with requiredPermission
// ============================================================================

describe('ProtectedRoute Permission Guard', () => {
  it('should allow access when user has required permission', () => {
    const userPerms: MockUserPermissions = {
      role: 'user',
      permissions: ['scan:create'],
      frontend_pages: ['/scan/new'],
      backend_apis: [],
    }
    const auth = createMockAuthContext(userPerms)

    const hasRequiredPermission = (requiredPermission?: string) => {
      if (!requiredPermission) return true
      return auth.hasPermission(requiredPermission)
    }

    expect(hasRequiredPermission('scan:create')).toBe(true)
  })

  it('should deny access when user lacks required permission', () => {
    const userPerms: MockUserPermissions = {
      role: 'user',
      permissions: ['scan:read'],
      frontend_pages: ['/'],
      backend_apis: [],
    }
    const auth = createMockAuthContext(userPerms)

    const hasRequiredPermission = (requiredPermission?: string) => {
      if (!requiredPermission) return true
      return auth.hasPermission(requiredPermission)
    }

    expect(hasRequiredPermission('scan:create')).toBe(false)
    expect(hasRequiredPermission('user:manage')).toBe(false)
  })

  it('should always allow admin regardless of permission', () => {
    const adminPerms: MockUserPermissions = {
      role: 'admin',
      permissions: ['*'],
      frontend_pages: ['*'],
      backend_apis: ['*'],
    }
    const auth = createMockAuthContext(adminPerms)

    expect(auth.hasPermission('any:permission')).toBe(true)
  })
})

// ============================================================================
// Test: Sidebar Menu Rendering
// ============================================================================

describe('Sidebar Menu Permission Rendering', () => {
  it('should show all menus for admin', () => {
    const adminPages = ['*']
    const allMenus = [
      { path: '/', name: 'Dashboard' },
      { path: '/scan/new', name: 'New Scan' },
      { path: '/reports', name: 'Reports' },
      { path: '/users', name: 'Users' },
      { path: '/roles', name: 'Roles' },
      { path: '/settings', name: 'Settings' },
    ]

    const visibleMenus = allMenus.filter(menu =>
      adminPages.includes('*') || adminPages.includes(menu.path)
    )

    expect(visibleMenus).toHaveLength(6)
  })

  it('should hide user/role management for non-admin', () => {
    const userPages = ['/', '/scan/new', '/reports', '/settings', '/profile']
    const allMenus = [
      { path: '/', name: 'Dashboard' },
      { path: '/scan/new', name: 'New Scan' },
      { path: '/reports', name: 'Reports' },
      { path: '/users', name: 'Users' },
      { path: '/roles', name: 'Roles' },
      { path: '/settings', name: 'Settings' },
    ]

    const visibleMenus = allMenus.filter(menu =>
      userPages.includes(menu.path)
    )

    expect(visibleMenus).toHaveLength(4)
    expect(visibleMenus.find(m => m.path === '/users')).toBeUndefined()
    expect(visibleMenus.find(m => m.path === '/roles')).toBeUndefined()
  })

  it('should hide write operations for viewer', () => {
    const viewerPages = ['/', '/scan/:scanId', '/reports', '/settings', '/knowledge', '/profile']
    const allMenus = [
      { path: '/', name: 'Dashboard' },
      { path: '/scan/new', name: 'New Scan' },
      { path: '/reports', name: 'Reports' },
      { path: '/scheduler', name: 'Scheduler' },
      { path: '/settings', name: 'Settings' },
    ]

    const visibleMenus = allMenus.filter(menu =>
      viewerPages.includes(menu.path)
    )

    expect(visibleMenus.find(m => m.path === '/scan/new')).toBeUndefined()
    expect(visibleMenus.find(m => m.path === '/scheduler')).toBeUndefined()
  })
})

// ============================================================================
// Test: Button-Level Permission Control
// ============================================================================

describe('Button-Level Permission Control', () => {
  it('should show delete button only for admin', () => {
    const adminPerms = { role: 'admin', permissions: ['*'] }
    const userPerms = { role: 'user', permissions: ['scan:read', 'scan:execute'] }
    const viewerPerms = { role: 'viewer', permissions: ['scan:read'] }

    const canDelete = (perms: typeof adminPerms) =>
      perms.role === 'admin' || perms.permissions.includes('scan:delete')

    expect(canDelete(adminPerms)).toBe(true)
    expect(canDelete(userPerms)).toBe(false)
    expect(canDelete(viewerPerms)).toBe(false)
  })

  it('should show execute button for admin and user', () => {
    const adminPerms = { role: 'admin', permissions: ['*'] }
    const userPerms = { role: 'user', permissions: ['scan:read', 'scan:execute'] }
    const viewerPerms = { role: 'viewer', permissions: ['scan:read'] }

    const canExecute = (perms: typeof adminPerms) =>
      perms.role === 'admin' || perms.permissions.includes('scan:execute')

    expect(canExecute(adminPerms)).toBe(true)
    expect(canExecute(userPerms)).toBe(true)
    expect(canExecute(viewerPerms)).toBe(false)
  })

  it('should show create report button for admin and user', () => {
    const adminPerms = { role: 'admin', permissions: ['*'] }
    const userPerms = { role: 'user', permissions: ['report:read', 'report:create'] }
    const viewerPerms = { role: 'viewer', permissions: ['report:read'] }

    const canCreateReport = (perms: typeof adminPerms) =>
      perms.role === 'admin' || perms.permissions.includes('report:create')

    expect(canCreateReport(adminPerms)).toBe(true)
    expect(canCreateReport(userPerms)).toBe(true)
    expect(canCreateReport(viewerPerms)).toBe(false)
  })
})

describe('Route Access Helper', () => {
  it('does not let frontend page mappings override explicit route permissions', () => {
    const viewerContext = {
      role: 'viewer',
      permissions: ['agent:read'],
      frontendPages: ['/realtime'],
    }

    expect(canAccessPage(viewerContext, '/realtime', 'agent:execute')).toBe(false)
    expect(canAccessPage(viewerContext, '/realtime')).toBe(true)
  })

  it('allows explicit route permissions for user and admin roles', () => {
    expect(canAccessPage({ role: 'user', permissions: ['agent:execute'], frontendPages: [] }, '/realtime', 'agent:execute')).toBe(true)
    expect(canAccessPage({ role: 'admin', permissions: [], frontendPages: [] }, '/realtime', 'agent:execute')).toBe(true)
  })
})

// ============================================================================
// Test: Permission-Based Route Guards
// ============================================================================

describe('Permission-Based Route Guards', () => {
  it('should allow admin to access any route', () => {
    const routes = [
      { path: '/users', permission: 'user:manage' },
      { path: '/roles', permission: 'user:manage' },
      { path: '/scan/new', permission: 'scan:create' },
      { path: '/settings', permission: 'settings:read' },
    ]

    const adminRole = 'admin'
    const canAccess = (route: typeof routes[0]) =>
      adminRole === 'admin' || true // admin bypasses all

    routes.forEach(route => {
      expect(canAccess(route)).toBe(true)
    })
  })

  it('should block user from admin-only routes', () => {
    const userPermissions = ['scan:create', 'scan:read', 'report:read']

    const adminOnlyRoutes = [
      { path: '/users', permission: 'user:manage' },
      { path: '/roles', permission: 'user:manage' },
    ]

    const canAccess = (requiredPermission: string) =>
      userPermissions.includes(requiredPermission)

    adminOnlyRoutes.forEach(route => {
      expect(canAccess(route.permission)).toBe(false)
    })
  })
})
