import type { AuthPermissionRequest, PermissionDecision } from '../types'

export interface Authorizer<User, Grant = unknown> {
  decide(input: {
    user: User
    grants: readonly Grant[]
    request: AuthPermissionRequest
  }): PermissionDecision
}

export function defineAuthorizer<User, Grant = unknown>(
  authorizer: Authorizer<User, Grant>,
): Authorizer<User, Grant> {
  return authorizer
}
