import type { ReactNode } from 'react'
import type { PermissionScope } from '../types'
import { useAuthDecision, useAuthStatus } from './hooks'

export interface CanAuthProps<Context = unknown> {
  action: string
  resource: string
  resourceId?: string
  context?: Context
  scope?: PermissionScope
  fallback?: ReactNode
  children: ReactNode
}

export function CanAuth<Context = unknown>({
  action,
  resource,
  resourceId,
  context,
  scope,
  fallback = null,
  children,
}: CanAuthProps<Context>): ReactNode {
  const decision = useAuthDecision({ action, resource, resourceId, context, scope })
  return decision.status === 'allowed' ? children : fallback
}

export function Authenticated({ children }: { children: ReactNode }): ReactNode {
  const status = useAuthStatus()
  return status === 'authenticated' ? children : null
}

export function Anonymous({ children }: { children: ReactNode }): ReactNode {
  const status = useAuthStatus()
  return status === 'anonymous' ? children : null
}
