import type { Authorizer } from './authorizer'
import type { AuthPermissionRequest } from '../types'

export interface CreateKeyAuthorizerOptions {
  wildcard?: string
  format?: (request: AuthPermissionRequest) => string
}

function defaultFormat(request: AuthPermissionRequest): string {
  return request.resource === request.action
    ? request.action
    : `${request.resource}:${request.action}`
}

export function createKeyAuthorizer<User = unknown>(
  options: CreateKeyAuthorizerOptions = {},
): Authorizer<User, string> {
  const wildcard = options.wildcard ?? '*'
  const format = options.format ?? defaultFormat

  return {
    decide({ grants, request }) {
      const key = format(request)
      if (grants.includes(wildcard) || grants.includes(key)) {
        return { status: 'allowed', source: 'key-authorizer' }
      }
      return { status: 'denied', source: 'key-authorizer' }
    },
  }
}
