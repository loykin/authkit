import { createStore } from 'zustand/vanilla'
import type { AuthState } from './types'

export function createAuthStateStore<User>(initial: AuthState<User>) {
  return createStore<AuthState<User>>(() => initial)
}

export function initialAuthState<User>(): AuthState<User> {
  return {
    status: 'idle',
    user: null,
    refreshing: false,
    error: null,
    permissionStatus: 'idle',
    permissionError: null,
    permissionsVersion: 0,
  }
}
