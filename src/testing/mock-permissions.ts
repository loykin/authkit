import type { PermissionSource } from '../permissions/source'

export interface MockPermissionSource<User> {
  source: PermissionSource<User, string>
  setGrants(next: readonly string[]): void
  grant(permission: string): void
  revoke(permission: string): void
}

export function createMockPermissionSource<User>(
  initialGrants: readonly string[] = [],
): MockPermissionSource<User> {
  let grants: string[] = [...initialGrants]

  const source: PermissionSource<User, string> = {
    async load() {
      return grants
    },
  }

  return {
    source,
    setGrants(next) {
      grants = [...next]
    },
    grant(permission) {
      if (!grants.includes(permission)) grants = [...grants, permission]
    },
    revoke(permission) {
      grants = grants.filter((g) => g !== permission)
    },
  }
}
