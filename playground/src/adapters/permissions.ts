import { definePermissionSource } from '@loykin/authkit'
import { API_BASE, type PlaygroundUser } from './session'

export const permissionSource = definePermissionSource<PlaygroundUser, string>({
  async load({ signal }) {
    const res = await fetch(`${API_BASE}/api/permissions`, { credentials: 'include', signal })
    if (!res.ok) return []
    const data = (await res.json()) as { permissions: string[] }
    return data.permissions
  },
})
