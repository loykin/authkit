export * from './types'
export * from './errors'

export { createAuthManager } from './manager'
export type { CreateAuthManagerOptions } from './manager'

export { defineSessionAdapter } from './session/adapter'
export type { SessionAdapter, SessionDiscovery, AdapterCallOptions } from './session/adapter'

export { definePermissionSource } from './permissions/source'
export type { PermissionSource } from './permissions/source'

export { defineAuthorizer } from './permissions/authorizer'
export type { Authorizer } from './permissions/authorizer'

export { createKeyAuthorizer } from './permissions/key-authorizer'
export type { CreateKeyAuthorizerOptions } from './permissions/key-authorizer'

export type { PermissionRequestNormalizer } from './permissions/normalize'

export { defineChallengeHandler } from './challenge/handler'

export { defineCsrfStrategy } from './transport/csrf'
export type { CsrfStrategy } from './transport/csrf'

export type { AuthFetchOptions } from './transport/auth-fetch'
