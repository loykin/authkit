# @loykin/authkit

Headless authentication and authorization runtime for browser SPAs. Authkit
does not issue sessions, store users, or run an OAuth2/OIDC flow — it connects
to your **existing** backend's login/session/refresh/permission API and turns
that into a single, consistent state layer your app can render against.

See [DESIGN.md](./DESIGN.md) for the full design rationale; this README is the
practical entry point.

---

## When to use

- You already have a backend that issues httpOnly cookie sessions (or bearer
  tokens) and you don't want to re-platform onto an IdP just to get a clean
  frontend auth/permission API.
- You want `can()`/`decide()` to be synchronous for rendering, with async
  refresh handled transparently on 401.
- You want the exact same code path in tests/Storybook as in production —
  `createMockAuthManager()` implements the identical `AuthManager` contract,
  not a stand-in.
- You don't want a specific `User` shape, endpoint name, or permission engine
  (CASL, Casbin.js, a remote PDP) hardcoded into the library.

If you want a library that also issues/owns sessions (NextAuth-style), or a
full IdP, authkit is not that — see [DESIGN.md §21](./DESIGN.md#21-유사-사례-검토)
for why that's a deliberate non-goal.

---

## Packages

| Import | Contents |
|---|---|
| `@loykin/authkit` | `createAuthManager`, adapters, types, errors — no React dependency |
| `@loykin/authkit/react` | `AuthProvider`, hooks, `<CanAuth>` |
| `@loykin/authkit/testing` | `createMockAuthManager`, scenarios — dev/test only, never re-exported from root |

## Installation

```bash
npm install @loykin/authkit
```

React bindings are an optional peer dependency:

```bash
npm install react
```

---

## Quick start

### 1. Describe your backend with a `SessionAdapter`

```ts
import { defineSessionAdapter, definePermissionSource, createAuthManager } from '@loykin/authkit'

interface AppUser {
  id: string
  email: string
  roles: string[]
}

const session = defineSessionAdapter<AppUser, { email: string; password: string }>({
  getUser: async ({ fetch }) => {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    return res.ok ? (await res.json()).user : null
  },
  login: async (credentials, { fetch }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    return (await res.json()).user
  },
  logout: async ({ fetch }) => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  },
  refresh: async ({ fetch }) => {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    return res.ok
  },
})

const permissions = definePermissionSource<AppUser, string>({
  load: async () => {
    const res = await fetch('/api/permissions', { credentials: 'include' })
    return res.ok ? (await res.json()).permissions : []
  },
})

const auth = createAuthManager({ session, permissions })
```

### 2. Wire it into React

```tsx
import { AuthProvider, useAuth, useCanAuth, CanAuth } from '@loykin/authkit/react'

root.render(
  <AuthProvider manager={auth}>
    <App />
  </AuthProvider>,
)

function DeleteDashboardButton() {
  return (
    <CanAuth action="delete" resource="dashboard" fallback={<button disabled>Delete</button>}>
      <button onClick={handleDelete}>Delete</button>
    </CanAuth>
  )
}

function Header() {
  const { status, user, logout } = useAuth<AppUser>()
  if (status !== 'authenticated') return null
  return (
    <header>
      {user.email} <button onClick={() => logout()}>Logout</button>
    </header>
  )
}
```

### 3. Reuse it in tests/Storybook without a backend

```ts
import { createMockAuthManager } from '@loykin/authkit/testing'

const auth = createMockAuthManager({
  user: { id: 'dev-admin', email: 'admin@example.com', roles: ['admin'] },
  permissions: ['dashboard:read', 'dashboard:create', 'dashboard:delete'],
})

// same <AuthProvider manager={auth}> as production — no `if (mock)` branches
```

---

## Core concepts

- **Deny by default** — `can()`/`decide()` return `false`/`denied` until a
  permission is explicitly loaded and granted. Anonymous users need no
  special-case branch in your `Authorizer` — no grants already means denied.
- **Sync render, async resolve** — `can()`/`decide()` are synchronous snapshot
  reads, safe to call during render. `resolve()`/`ensure()`/`require()` handle
  the async path (loading permissions, running an MFA/reauth challenge).
- **Auth-aware `fetch()`** — `auth.fetch()` adds `credentials: 'include'`,
  and on a 401 runs refresh exactly once (deduped across concurrent requests),
  then retries the original request exactly once. Login/logout/refresh calls
  made by your `SessionAdapter` bypass this pipeline entirely, since they use
  the raw `fetch` handed to them — no exclusion list needed.
- **No implicit singleton** — `createAuthManager()` never auto-instantiates;
  your app owns the instance, which is what makes multi-tenant / multi-instance
  usage possible.
- **Real/mock parity** — `createMockAuthManager()` builds on the exact same
  `createAuthManager()` internals with mock adapters swapped in. `.mock.*`
  control methods (`setScenario`, `grant`, `expireSession`,
  `triggerUnauthorized`, ...) mutate those adapters and then call the same
  public `reloadUser()`/`reloadPermissions()`/`fetch()` any real app calls.

## Status

Phase 1–4 of the [DESIGN.md §18](./DESIGN.md#18-구현-단계) roadmap are
implemented and tested: Core, HTTP (auth-aware fetch, refresh single-flight,
CSRF), React bindings, and the mock/testing runtime. Phase 5 (wiring this into
a real consuming app) happens in that app's own repo, not here.

## Playground

`playground/` runs the library against a real Node backend (real httpOnly
cookies, live 401 → refresh → retry) and against `createMockAuthManager()`
side by side, importing straight from `src/` so there's no rebuild step
between an edit and seeing it in the browser.

```bash
cd playground && pnpm server   # fake backend on :4001
cd playground && pnpm dev      # app on :5174
```

Login with `admin@example.com` / `viewer@example.com`, password `password`.

## Development

```bash
pnpm build         # type-check + lint + tsup
pnpm type-check     # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest run
```

See [AGENTS.md](./AGENTS.md) for the fuller architecture/contributor map.

## License

MIT
