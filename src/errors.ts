import type { AuthChallenge } from './types'

export interface AuthErrorOptions {
  code?: string
  status?: number
  cause?: unknown
}

export class AuthError extends Error {
  code: string
  status?: number
  cause?: unknown

  constructor(message: string, options: AuthErrorOptions = {}) {
    super(message)
    this.name = 'AuthError'
    this.code = options.code ?? 'auth_error'
    this.status = options.status
    this.cause = options.cause
  }
}

export class AuthenticationRequiredError extends AuthError {
  constructor(message = 'Authentication required', options: AuthErrorOptions = {}) {
    super(message, { code: 'authentication_required', ...options })
    this.name = 'AuthenticationRequiredError'
  }
}

export class AuthorizationDeniedError extends AuthError {
  constructor(message = 'Authorization denied', options: AuthErrorOptions = {}) {
    super(message, { code: 'authorization_denied', ...options })
    this.name = 'AuthorizationDeniedError'
  }
}

export class SessionRefreshError extends AuthError {
  constructor(message = 'Session refresh failed', options: AuthErrorOptions = {}) {
    super(message, { code: 'session_refresh_failed', ...options })
    this.name = 'SessionRefreshError'
  }
}

export class PermissionLoadError extends AuthError {
  constructor(message = 'Permission load failed', options: AuthErrorOptions = {}) {
    super(message, { code: 'permission_load_failed', ...options })
    this.name = 'PermissionLoadError'
  }
}

export class ChallengeRequiredError extends AuthError {
  challenge: AuthChallenge

  constructor(
    challenge: AuthChallenge,
    message = 'Additional interaction required',
    options: AuthErrorOptions = {},
  ) {
    super(message, { code: 'challenge_required', ...options })
    this.name = 'ChallengeRequiredError'
    this.challenge = challenge
  }
}

export class RequestReplayError extends AuthError {
  constructor(message = 'Request body cannot be replayed', options: AuthErrorOptions = {}) {
    super(message, { code: 'request_replay_failed', ...options })
    this.name = 'RequestReplayError'
  }
}
