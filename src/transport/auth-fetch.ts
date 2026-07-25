import { RequestReplayError } from '../errors'
import type { CsrfStrategy } from './csrf'
import { tryCloneRequest } from './request-replay'

export interface AuthFetchOptions {
  fetch?: typeof globalThis.fetch
  refresh: () => Promise<boolean>
  csrf?: CsrfStrategy
}

export function createAuthFetch(
  options: AuthFetchOptions,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  const refresh = options.refresh
  const csrf = options.csrf

  return async function authFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> {
    const baseRequest = new Request(input, { credentials: 'include', ...init })
    const request = csrf ? await csrf.apply(baseRequest) : baseRequest
    const replay = tryCloneRequest(request)

    const response = await fetchImpl(request)
    if (response.status !== 401) return response
    if (request.signal?.aborted) return response

    const refreshed = await refresh()
    if (!refreshed) return response

    if (!replay) {
      throw new RequestReplayError('Request body cannot be replayed after refresh')
    }

    csrf?.reset?.()
    const retryRequest = csrf ? await csrf.apply(replay) : replay

    return fetchImpl(retryRequest)
  }
}
