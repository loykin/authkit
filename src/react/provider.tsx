import { createContext, useContext, useEffect, type ReactNode } from 'react'
import type { AuthManager, AuthPermissionRequest } from '../types'

const AuthManagerContext = createContext<AuthManager<
  unknown,
  unknown,
  AuthPermissionRequest
> | null>(null)

export interface AuthProviderProps<
  User,
  Credentials = unknown,
  PermissionRequest extends AuthPermissionRequest = AuthPermissionRequest,
> {
  manager: AuthManager<User, Credentials, PermissionRequest>
  children: ReactNode
}

export function AuthProvider<
  User,
  Credentials = unknown,
  PermissionRequest extends AuthPermissionRequest = AuthPermissionRequest,
>({ manager, children }: AuthProviderProps<User, Credentials, PermissionRequest>) {
  useEffect(() => {
    void manager.initialize()
  }, [manager])

  return (
    <AuthManagerContext.Provider
      value={manager as unknown as AuthManager<unknown, unknown, AuthPermissionRequest>}
    >
      {children}
    </AuthManagerContext.Provider>
  )
}

export function useAuthManager<
  User = unknown,
  Credentials = unknown,
  PermissionRequest extends AuthPermissionRequest = AuthPermissionRequest,
>(): AuthManager<User, Credentials, PermissionRequest> {
  const manager = useContext(AuthManagerContext)
  if (!manager) {
    throw new Error('useAuthManager() must be used within an <AuthProvider>')
  }
  return manager as unknown as AuthManager<User, Credentials, PermissionRequest>
}
