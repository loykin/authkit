import type { AuthEvent } from './types'

export function createEventEmitter<User>() {
  const listeners = new Set<(event: AuthEvent<User>) => void>()

  return {
    subscribe(listener: (event: AuthEvent<User>) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(event: AuthEvent<User>): void {
      for (const listener of listeners) listener(event)
    },
  }
}
