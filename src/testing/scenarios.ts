import type { AuthStatus } from '../types'

export interface AuthScenario<User> {
  status?: AuthStatus
  user?: User | null
  permissions?: readonly string[]
}

export function createAuthScenario<User>(scenario: AuthScenario<User>): AuthScenario<User> {
  return scenario
}
