import axios from 'axios'

export const AUTH_URL = '/api/v1/auth'

let refreshPromise: Promise<string> | null = null

export function getStoredToken(): string | null {
  return localStorage.getItem('access_token')
}

export function setStoredToken(token: string) {
  localStorage.setItem('access_token', token)
}

export function setStoredRefreshToken(token: string) {
  localStorage.setItem('refresh_token', token)
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem('refresh_token')
}

export function removeStoredToken() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

export function isAuthRefreshRequest(url?: string) {
  return Boolean(url?.includes('/auth/refresh'))
}

export async function refreshAccessToken() {
  if (!refreshPromise) {
    const refreshToken = getStoredRefreshToken()
    if (!refreshToken) {
      removeStoredToken()
      throw new Error('No refresh token')
    }

    refreshPromise = axios
      .post(`${AUTH_URL}/refresh`, { refresh_token: refreshToken })
      .then(response => {
        const { access_token, refresh_token } = response.data
        setStoredToken(access_token)
        setStoredRefreshToken(refresh_token)
        return access_token
      })
      .catch(error => {
        removeStoredToken()
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}
