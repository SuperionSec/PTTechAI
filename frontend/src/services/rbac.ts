import { get } from './request'

export interface RbacProfile {
  role: string
  permissions: string[]
  frontend_pages: string[]
  backend_apis: string[]
  access?: Record<string, boolean>
}

export const rbacApi = {
  me: () => get<RbacProfile>('/permissions/me/detail'),
}
