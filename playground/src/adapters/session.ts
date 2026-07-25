import { defineSessionAdapter } from '@loykin/authkit'

export const API_BASE = 'http://localhost:4001'

export interface PlaygroundUser {
  id: string
  email: string
  roles: string[]
}

export interface LoginInput {
  email: string
  password: string
}

export const sessionAdapter = defineSessionAdapter<PlaygroundUser, LoginInput>({
  async getUser({ fetch, signal }) {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include', signal })
    if (!res.ok) return null
    const data = (await res.json()) as { user: PlaygroundUser }
    return data.user
  },
  async login(credentials, { fetch, signal }) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      signal,
    })
    if (!res.ok) {
      throw new Error('login failed — try admin@example.com / password')
    }
    const data = (await res.json()) as { user: PlaygroundUser }
    return data.user
  },
  async logout({ fetch, signal }) {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      signal,
    })
  },
  async refresh({ fetch, signal }) {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      signal,
    })
    return res.ok
  },
})
