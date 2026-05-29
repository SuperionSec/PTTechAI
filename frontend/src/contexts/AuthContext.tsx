import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { systemApi } from '../services/system'
import {
  AUTH_URL,
  getStoredRefreshToken,
  getStoredToken,
  refreshAccessToken,
  removeStoredToken,
  setStoredRefreshToken,
  setStoredToken,
} from '../services/authTokens'

interface User {
  id: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string
}

interface UserPermissions {
  role: string
  permissions: string[]
  frontend_pages: string[]
  backend_apis: string[]
}

interface AuthContextType {
  user: User | null
  userPermissions: UserPermissions | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName?: string) => Promise<void>
  logout: () => void
  hasPermission: (permission: string) => boolean
  canAccessPage: (path: string) => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

// Get token expiration time
function getTokenExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000
  } catch {
    return 0
  }
}

// Note: Navigation is handled by AuthProvider using event emitter pattern
// to avoid full page reloads
const authEvents = {
  listeners: new Set<() => void>(),
  emit() {
    this.listeners.forEach(fn => fn())
  },
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userPermissions, setUserPermissions] = useState<UserPermissions | null>(null)
  const [token, setToken] = useState<string | null>(getStoredToken())
  const [loading, setLoading] = useState(true)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFetchingRef = useRef(false)
  const navigate = useNavigate()

  const fetchUserPermissions = useCallback(async () => {
    try {
      const data = await systemApi.me()
      setUserPermissions(data)
    } catch (error) {
      console.error('Failed to fetch user permissions:', error)
      setUserPermissions(null)
    }
  }, [])

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
      const refreshToken = getStoredRefreshToken()
      if (!refreshToken) {
        removeStoredToken()
        setToken(null)
        setLoading(false)
        isFetchingRef.current = false
        return
      }
    }

    try {
      const res = await axios.get(`${AUTH_URL}/me`, {
        headers: { Authorization: `Bearer ${t}` }
      })
      setUser(res.data)
      setToken(t)
      // Fetch user permissions after user is loaded
      await fetchUserPermissions()
    } catch (error: any) {
      // 401: token expired, clear auth state; Network errors: keep token
      if (error.response?.status === 401) {
        removeStoredToken()
        authEvents.emit()
      }
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }, [fetchUserPermissions])

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
        const refreshToken = getStoredRefreshToken()
        if (!refreshToken) return
        try {
          const accessToken = await refreshAccessToken()
          setToken(accessToken)
          setupTokenRefresh()
        } catch {
          authEvents.emit()
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

  // Listen for auth events (401 errors) and navigate without full page reload
  useEffect(() => {
    const unsubscribe = authEvents.subscribe(() => {
      setUser(null)
      setToken(null)
      navigate('/login')
    })
    return () => unsubscribe()
  }, [navigate])

  const login = async (email: string, password: string) => {
    const res = await axios.post(`${AUTH_URL}/login`, { email, password })
    const { access_token, refresh_token } = res.data
    setStoredToken(access_token)
    setStoredRefreshToken(refresh_token)
    setToken(access_token)
    const userRes = await axios.get(`${AUTH_URL}/me`, {
      headers: { Authorization: `Bearer ${access_token}` }
    })
    setUser(userRes.data)
    await fetchUserPermissions()
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
    setUserPermissions(null)
  }

  const hasPermission = useCallback((permission: string) => {
    if (!userPermissions) return false
    return userPermissions.permissions.includes(permission)
  }, [userPermissions])

  const canAccessPage = useCallback((path: string) => {
    if (!userPermissions) return false
    // Admin can access everything
    if (userPermissions.role === 'admin') return true
    return userPermissions.frontend_pages.includes(path)
  }, [userPermissions])

  return (
    <AuthContext.Provider value={{ user, userPermissions, token, loading, login, register, logout, hasPermission, canAccessPage }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
