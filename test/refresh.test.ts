import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthFetch } from '../src/transport/auth-fetch'
import { tryCloneRequest } from '../src/transport/request-replay'
import type { CsrfStrategy } from '../src/transport/csrf'
import { RequestReplayError } from '../src/errors'

const BASE = 'https://example.com'

describe('tryCloneRequest', () => {
  it('returns a clone for an ordinary request', () => {
    const request = new Request(`${BASE}/api/dashboards`, { method: 'POST', body: 'hi' })
    const clone = tryCloneRequest(request)
    expect(clone).not.toBeNull()
    expect(clone?.method).toBe('POST')
  })

  it('returns null when the request cannot be cloned', () => {
    const spy = vi.spyOn(Request.prototype, 'clone').mockImplementation(() => {
      throw new TypeError('body already used')
    })
    const request = new Request(`${BASE}/api/dashboards`)
    expect(tryCloneRequest(request)).toBeNull()
    spy.mockRestore()
  })
})

describe('createAuthFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns non-401 responses unchanged without calling refresh', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const refresh = vi.fn(async () => true)
    const authFetch = createAuthFetch({ fetch: fetchImpl, refresh })

    const response = await authFetch(`${BASE}/api/dashboards`)

    expect(response.status).toBe(200)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('does not treat 403 as a refresh trigger', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 }))
    const refresh = vi.fn(async () => true)
    const authFetch = createAuthFetch({ fetch: fetchImpl, refresh })

    const response = await authFetch(`${BASE}/api/dashboards`)

    expect(response.status).toBe(403)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('retries the original request once after a successful refresh', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const refresh = vi.fn(async () => true)
    const authFetch = createAuthFetch({ fetch: fetchImpl, refresh })

    const response = await authFetch(`${BASE}/api/dashboards`, {
      method: 'POST',
      headers: { 'X-Test': '1' },
      body: JSON.stringify({ a: 1 }),
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(200)

    const retried = fetchImpl.mock.calls[1][0] as Request
    expect(retried.method).toBe('POST')
    expect(retried.headers.get('X-Test')).toBe('1')
    expect(await retried.clone().text()).toBe(JSON.stringify({ a: 1 }))
  })

  it('returns the original 401 response without retrying when refresh fails', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }))
    const refresh = vi.fn(async () => false)
    const authFetch = createAuthFetch({ fetch: fetchImpl, refresh })

    const response = await authFetch(`${BASE}/api/dashboards`)

    expect(response.status).toBe(401)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not retry when the request was aborted', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }))
    const refresh = vi.fn(async () => true)
    const authFetch = createAuthFetch({ fetch: fetchImpl, refresh })
    const controller = new AbortController()
    controller.abort()

    const response = await authFetch(`${BASE}/api/dashboards`, { signal: controller.signal })

    expect(response.status).toBe(401)
    expect(refresh).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('throws RequestReplayError when refresh succeeds but the body cannot be replayed', async () => {
    const spy = vi.spyOn(Request.prototype, 'clone').mockImplementation(() => {
      throw new TypeError('body already used')
    })
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }))
    const refresh = vi.fn(async () => true)
    const authFetch = createAuthFetch({ fetch: fetchImpl, refresh })

    await expect(authFetch(`${BASE}/api/dashboards`, { method: 'POST' })).rejects.toBeInstanceOf(
      RequestReplayError,
    )
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    spy.mockRestore()
  })

  it("calls refresh() once per request; de-duping concurrent 401s is refresh-coordinator's job", async () => {
    const refresh = vi.fn(async () => false)
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }))
    const authFetch = createAuthFetch({ fetch: fetchImpl, refresh })

    await Promise.all([authFetch(`${BASE}/api/a`), authFetch(`${BASE}/api/b`)])

    // authFetch itself calls refresh() once per request; single-flight de-duping
    // across concurrent requests is refresh-coordinator's job (see manager.ts),
    // exercised end-to-end in manager.test.ts's fetch() single-flight test.
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('applies the CSRF strategy to both the initial and retried request, and resets before retry', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const refresh = vi.fn(async () => true)
    let tokenCounter = 0
    const reset = vi.fn(() => {
      tokenCounter += 1
    })
    const csrf: CsrfStrategy = {
      apply: vi.fn((request: Request) => {
        const headers = new Headers(request.headers)
        headers.set('X-CSRF-Token', String(tokenCounter))
        return new Request(request, { headers })
      }),
      reset,
    }
    const authFetch = createAuthFetch({ fetch: fetchImpl, refresh, csrf })

    await authFetch(`${BASE}/api/dashboards`)

    expect(csrf.apply).toHaveBeenCalledTimes(2)
    expect(reset).toHaveBeenCalledTimes(1)
    const initial = fetchImpl.mock.calls[0][0] as Request
    const retried = fetchImpl.mock.calls[1][0] as Request
    expect(initial.headers.get('X-CSRF-Token')).toBe('0')
    expect(retried.headers.get('X-CSRF-Token')).toBe('1')
  })
})
