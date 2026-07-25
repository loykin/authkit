import { useMemo, useSyncExternalStore } from 'react'
import type { AuthManager, AuthPermissionRequest, AuthState, PermissionDecision } from '../types'
import { useAuthManager } from './provider'

interface PermissionSnapshot<User> {
  user: User | null
  permissionStatus: AuthState<User>['permissionStatus']
  permissionsVersion: number
}

// can()/decide() only ever depend on user identity, permissionStatus, and
// permissionsVersion (see manager.ts's decide()) — not on refreshing/error/tenantId.
// Selecting just this slice, memoized by reference, keeps useCanAuth/useAuthDecision
// from re-rendering on unrelated state changes (e.g. a background token refresh).
function createPermissionSnapshotSelector<User>(
  manager: AuthManager<User, unknown, AuthPermissionRequest>,
): () => PermissionSnapshot<User> {
  let cached: PermissionSnapshot<User> | null = null
  return () => {
    const state = manager.getState()
    if (
      !cached ||
      cached.user !== state.user ||
      cached.permissionStatus !== state.permissionStatus ||
      cached.permissionsVersion !== state.permissionsVersion
    ) {
      cached = {
        user: state.user,
        permissionStatus: state.permissionStatus,
        permissionsVersion: state.permissionsVersion,
      }
    }
    return cached
  }
}

export function useAuth<User = unknown, Credentials = unknown>(): AuthState<User> & {
  login: (credentials: Credentials) => Promise<void>
  logout: () => Promise<void>
} {
  const manager = useAuthManager<User, Credentials>()
  const state = useSyncExternalStore(manager.subscribe, manager.getState, manager.getState)

  return {
    ...state,
    login: manager.login,
    logout: manager.logout,
  }
}

export function useAuthUser<User = unknown>(): User | null {
  const manager = useAuthManager<User>()
  return useSyncExternalStore(
    manager.subscribe,
    () => manager.getState().user,
    () => manager.getState().user,
  )
}

export function useAuthStatus(): AuthState<unknown>['status'] {
  const manager = useAuthManager()
  return useSyncExternalStore(
    manager.subscribe,
    () => manager.getState().status,
    () => manager.getState().status,
  )
}

export function useCanAuth<PermissionRequest extends AuthPermissionRequest = AuthPermissionRequest>(
  request: PermissionRequest | string,
): boolean {
  const manager = useAuthManager<unknown, unknown, PermissionRequest>()
  const getSnapshot = useMemo(() => createPermissionSnapshotSelector(manager), [manager])
  useSyncExternalStore(manager.subscribe, getSnapshot, getSnapshot)
  return manager.can(request)
}

export function useAuthDecision<
  PermissionRequest extends AuthPermissionRequest = AuthPermissionRequest,
>(request: PermissionRequest | string): PermissionDecision {
  const manager = useAuthManager<unknown, unknown, PermissionRequest>()
  const getSnapshot = useMemo(() => createPermissionSnapshotSelector(manager), [manager])
  useSyncExternalStore(manager.subscribe, getSnapshot, getSnapshot)
  return manager.decide(request)
}
