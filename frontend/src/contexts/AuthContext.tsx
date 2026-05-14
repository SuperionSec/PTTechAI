import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'

interface User {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'user' | 'viewer' | 'service'
  is_active: boolean
  created_at: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const AUTH_URL = '/api/v1/auth'

function getStoredToken(): string | null {
  return localStorage.getItem('access_token')
}

function setStoredToken(token: string) {
  localStorage.setItem('access_token', token)
}

function removeStoredToken() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

// Get token expiration time
function getTokenExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000
  } catch {
    return 0
  }
}

axios.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          error.config._retry = true
          const res = await axios.post(`${AUTH_URL}/refresh`, { refresh_token: refreshToken })
          const { access_token, refresh_token } = res.data
          setStoredToken(access_token)
          localStorage.setItem('refresh_token', refresh_token)
          error.config.headers.Authorization = `Bearer ${access_token}`
          return axios(error.config)
        } catch {
          error.config._retry = true
          removeStoredToken()
          window.location.href = '/login'
          return Promise.reject(error)
        }
      }
      removeStoredToken()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(getStoredToken())
  const [loading, setLoading] = useState(true)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFetchingRef = useRef(false)

  const fetchUser = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    const t = getStoredToken()
    if (!t) {
      setLoading(false)
      isFetchingRef.current = false
      return
    }

    // Check if token is already expired
    const exp = getTokenExp(t)
    if (exp && exp < Date.now()) {
      // Token expired, try refresh or clear
      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) {
        removeStoredToken()
        setToken(null)
        setLoading(false)
        isFetchingRef.current = false
        return
      }
    }

    try {
      const res = await axios.get(`${AUTH_URL}/me`)
      setUser(res.data)
      setToken(t)
    } catch (error: any) {
      // 401 will be handled by axios interceptor (refresh + redirect)
      // Network errors: keep token, don't clear
      if (!error.response || error.response.status !== 401) {
        // Keep existing auth state on network error
      }
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }, [])

  // Setup automatic token refresh
  const setupTokenRefresh = useCallback(() => {
    const t = getStoredToken()
    if (!t) return

    const exp = getTokenExp(t)
    if (!exp) return

    const now = Date.now()
    const timeUntilRefresh = exp - now - 60 * 60 * 1000 // Refresh 1 hour before expiry

    if (timeUntilRefresh > 0) {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
      refreshTimerRef.current = setTimeout(async () => {
        const refreshToken = localStorage.getItem('refresh_token')
        if (!refreshToken) return
        try {
          const res = await axios.post(`${AUTH_URL}/refresh`, { refresh_token: refreshToken })
          const { access_token, refresh_token } = res.data
          setStoredToken(access_token)
          localStorage.setItem('refresh_token', refresh_token)
          setToken(access_token)
          setupTokenRefresh()
        } catch {
          // Refresh failed, will be handled on next request by interceptor
        }
      }, timeUntilRefresh)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (token) {
      setupTokenRefresh()
    }
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [token, setupTokenRefresh])

  const login = async (email: string, password: string) => {
    const res = await axios.post(`${AUTH_URL}/login`, { email, password })
    const { access_token, refresh_token } = res.data
    setStoredToken(access_token)
    localStorage.setItem('refresh_token', refresh_token)
    setToken(access_token)
    const userRes = await axios.get(`${AUTH_URL}/me`)
    setUser(userRes.data)
    setupTokenRefresh()
  }

  const register = async (email: string, password: string, fullName?: string) => {
    await axios.post(`${AUTH_URL}/register`, { email, password, full_name: fullName })
    await login(email, password)
  }

  const logout = async () => {
    try {
      await axios.post(`${AUTH_URL}/logout`)
    } catch {
      // Ignore error, still clear local storage
    }
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }
    removeStoredToken()
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
