interface PermissionContext {
  role?: string
  permissions?: string[]
  frontendPages?: string[]
}

function normalizePattern(pattern: string) {
  return pattern.replace(/:[^/]+/g, '[^/]+')
}

export function matchPathPattern(pattern: string, path: string) {
  if (pattern === path) return true
  const regex = new RegExp(`^${normalizePattern(pattern)}$`)
  return regex.test(path)
}

export function hasPermission(ctx: PermissionContext, permission?: string) {
  if (!permission) return true
  if (ctx.role === 'admin') return true
  return Boolean(ctx.permissions?.includes(permission))
}

export function canAccessPage(ctx: PermissionContext, path: string, permission?: string) {
  if (ctx.role === 'admin') return true
  if (permission && hasPermission(ctx, permission)) return true
  return Boolean(ctx.frontendPages?.some(page => matchPathPattern(page, path)))
}

export const canAccessPath = canAccessPage
