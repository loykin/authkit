import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = 4001
const ORIGIN = 'http://localhost:5174'
const PASSWORD = 'password'

const USERS = {
  'admin@example.com': {
    id: 'u-admin',
    email: 'admin@example.com',
    roles: ['admin'],
    permissions: ['*'],
  },
  'viewer@example.com': {
    id: 'u-viewer',
    email: 'viewer@example.com',
    roles: ['viewer'],
    permissions: ['dashboard:read'],
  },
}

// sessionId -> { userId, valid }
// "valid: false" simulates the backend having invalidated the session
// (e.g. admin revoked it) without the client knowing yet — the next
// protected request will 401, which is exactly what Phase 2's
// auth-aware fetch is supposed to notice and recover from via refresh().
const sessions = new Map()

function userById(id) {
  return Object.values(USERS).find((u) => u.id === id)
}

function parseCookies(req) {
  const header = req.headers.cookie
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((part) => {
      const [key, ...rest] = part.trim().split('=')
      return [key, decodeURIComponent(rest.join('='))]
    }),
  )
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function setSessionCookie(res, sessionId) {
  res.setHeader(
    'Set-Cookie',
    `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
  )
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const cookies = parseCookies(req)
  const sessionId = cookies.session
  const session = sessionId ? sessions.get(sessionId) : undefined

  console.log(`${req.method} ${url.pathname} session=${sessionId ?? '-'} valid=${session?.valid}`)

  try {
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readJson(req)
      const user = USERS[body.email]
      if (!user || body.password !== PASSWORD) {
        return json(res, 401, { error: 'invalid credentials' })
      }
      const id = randomUUID()
      sessions.set(id, { userId: user.id, valid: true })
      setSessionCookie(res, id)
      return json(res, 200, { user })
    }

    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      if (!session || !session.valid) return json(res, 401, { error: 'unauthorized' })
      return json(res, 200, { user: userById(session.userId) })
    }

    if (url.pathname === '/api/auth/refresh' && req.method === 'POST') {
      if (!session) return json(res, 401, { error: 'no session' })
      // toy backend: refreshing always re-validates the existing session
      session.valid = true
      return json(res, 200, { ok: true })
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      if (sessionId) sessions.delete(sessionId)
      clearSessionCookie(res)
      return json(res, 200, { ok: true })
    }

    if (url.pathname === '/api/permissions' && req.method === 'GET') {
      if (!session || !session.valid) return json(res, 401, { error: 'unauthorized' })
      return json(res, 200, { permissions: userById(session.userId)?.permissions ?? [] })
    }

    if (url.pathname === '/api/dashboards' && req.method === 'GET') {
      if (!session || !session.valid) return json(res, 401, { error: 'unauthorized' })
      return json(res, 200, {
        dashboards: [
          { id: 'd1', name: 'Revenue' },
          { id: 'd2', name: 'Usage' },
        ],
      })
    }

    // debug-only: simulates the backend invalidating the session out from
    // under the client (expired token, admin kick, etc.) without telling it.
    if (url.pathname === '/api/debug/expire' && req.method === 'POST') {
      if (session) session.valid = false
      return json(res, 200, { ok: true })
    }

    json(res, 404, { error: 'not found' })
  } catch (error) {
    json(res, 500, { error: String(error) })
  }
})

server.listen(PORT, () => {
  console.log(`authkit playground fake backend listening on http://localhost:${PORT}`)
  console.log('Login with admin@example.com / password or viewer@example.com / password')
})
