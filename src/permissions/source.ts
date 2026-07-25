import type { PermissionScope } from '../types'

export interface PermissionSource<User, Grant = unknown> {
  load(input: {
    user: User
    scope?: PermissionScope
    signal?: AbortSignal
  }): Promise<readonly Grant[]>
}

export function definePermissionSource<User, Grant = unknown>(
  source: PermissionSource<User, Grant>,
): PermissionSource<User, Grant> {
  return source
}
