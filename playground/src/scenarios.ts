import { createAuthScenario } from '@loykin/authkit/testing'
import type { PlaygroundUser } from './adapters/session'

export const scenarios = {
  anonymous: createAuthScenario<PlaygroundUser>({
    status: 'anonymous',
    user: null,
  }),
  viewer: createAuthScenario<PlaygroundUser>({
    user: { id: 'mock-viewer', email: 'viewer@example.com', roles: ['viewer'] },
    permissions: ['dashboard:read'],
  }),
  editor: createAuthScenario<PlaygroundUser>({
    user: { id: 'mock-editor', email: 'editor@example.com', roles: ['editor'] },
    permissions: ['dashboard:read', 'dashboard:create', 'dashboard:update'],
  }),
  admin: createAuthScenario<PlaygroundUser>({
    user: { id: 'mock-admin', email: 'admin@example.com', roles: ['admin'] },
    permissions: ['*'],
  }),
}
