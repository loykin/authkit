# Authkit — AI Agent Instructions

## Project Overview

- **Package**: `@loykin/authkit`
- **Description**: Headless authentication and authorization runtime. Connects to an existing backend's login/session/refresh/permission API instead of owning identity itself.
- **Stack**: TypeScript, `zustand/vanilla` (core store), React as an optional peer (`react` subpath, Phase 3+)
- **Design doc**: [DESIGN.md](./DESIGN.md) is authoritative. Read it before changing any public API shape — every interface in `src/` traces back to a numbered section there.
- **Status**: Phase 1–4 (Core/HTTP/React/Testing) implemented — see DESIGN.md 18장 for the phase plan. Phase 5 (Piper/data-voyager application) is out of scope for this repo.
- **Monorepo**: root (library) + `playground/` (Vite app + fake backend, pnpm workspace member).

## Commands

```bash
pnpm build         # type-check + lint + tsup
pnpm build:js      # tsup only
pnpm dev           # tsup --watch
pnpm type-check    # tsc --noEmit
pnpm lint          # eslint
pnpm test          # vitest run
pnpm test:watch    # vitest
```

### Playground

Exercises the library against a real backend (Phase 1/2, real httpOnly cookies + live 401 → refresh → retry) and against `createMockAuthManager()` (Phase 3/4), side by side in one app. Imports `@loykin/authkit` (and `/react`, `/testing`) aliased straight to `src/*.ts` — no build step needed between library edits and seeing them in the browser.

```bash
cd playground && pnpm server   # fake Node backend on :4001 (in-memory sessions, see server/index.mjs)
cd playground && pnpm dev      # Vite app on :5174
```

Login with `admin@example.com` / `viewer@example.com`, password `password`. The "Expire session on server, then fetch" button proves the real 401 → refresh → retry pipeline end-to-end.

## Architecture

- `src/index.ts` — public API (`.` export)
- `src/types.ts` — core types: `AuthManager`, `AuthState`, `AuthStatus`, `AuthEvent`, `AuthPermissionRequest`, `PermissionDecision`, `PermissionScope`
- `src/errors.ts` — `AuthError` and subclasses (`AuthenticationRequiredError`, `AuthorizationDeniedError`, `SessionRefreshError`, `PermissionLoadError`, `ChallengeRequiredError`, `RequestReplayError`)
- `src/state.ts` — `zustand/vanilla` store backing `getState()`/`subscribe()`
- `src/events.ts` — `AuthEvent` emitter backing `subscribeEvent()`
- `src/manager.ts` — `createAuthManager()`, the `AuthManager` implementation
- `src/session/` — `SessionAdapter`, `defineSessionAdapter()` (DESIGN.md 8장)
- `src/permissions/` — `PermissionSource`, `Authorizer`, `createKeyAuthorizer()` (DESIGN.md 10장)
- `src/transport/` — auth-aware `fetch`, refresh single-flight, CSRF, request replay (Phase 2, DESIGN.md 9장)
- `src/challenge/` — `ChallengeHandler`, `ensure()`/`require()` interaction flow (Phase 1 core + Phase 2 refinement, DESIGN.md 11장)
- `src/react/` — `AuthProvider`, hooks, `<CanAuth>` (Phase 3, DESIGN.md 12장, own `./react` export)
- `src/testing/` — mock manager, scenarios (Phase 4, DESIGN.md 14장, own `./testing` export, never re-exported from root)

## Design principles (DESIGN.md 4장)

- **Headless first** — core has no React dependency; state is a vanilla store.
- **Adapter-driven** — login/session/refresh shape, user schema, permission source are all supplied by the app via adapters. Never hardcode an endpoint name or a `User` schema.
- **Deny by default** — unresolved auth/permission state renders as `false`/`denied`, not `true`. This also means `anonymous` needs no special-case branch in the authorizer (DESIGN.md 4.3): no grants → `denied`/`unknown` falls out naturally.
- **Sync render, async resolve** — `can()`/`decide()` are synchronous snapshot reads. Network-backed decisions go through `resolve()`/`ensure()`/`require()`, never inside a render path.
- **No implicit global singleton** — `createAuthManager()` never auto-instantiates; the app owns the instance and passes it down (needed for multi-tenant / multi-instance use, see DESIGN.md 9.5 on scoping `BroadcastChannel` names).
- **Real/mock parity** — `testing`'s mock manager implements the exact same `AuthManager` interface as the real one; no `if (mock)` branches in application code.

## Conventions

- No unnecessary comments — only add when the WHY is non-obvious.
- Don't add functionality beyond what the current phase in DESIGN.md 18장 calls for (e.g. don't build transport/refresh logic while on Phase 1).
- **Git operations (`git init`, `git add`, `git commit`, `git push`, branch/tag management) are the user's responsibility. Never run them, even if asked to "finish up" or "save progress."**
