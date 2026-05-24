import api from './api'

export async function request<T>(url: string, options?: { method?: string; data?: unknown; params?: unknown; headers?: Record<string, string> }) {
  const response = await api.request<T>({
    url,
    method: options?.method ?? 'GET',
    data: options?.data,
    params: options?.params,
    headers: options?.headers,
  })
  return response.data
}

export function get<T>(url: string, params?: unknown) {
  return request<T>(url, { params })
}

export function post<T>(url: string, data?: unknown) {
  return request<T>(url, { method: 'POST', data })
}

export function put<T>(url: string, data?: unknown) {
  return request<T>(url, { method: 'PUT', data })
}

export function del<T>(url: string) {
  return request<T>(url, { method: 'DELETE' })
}
