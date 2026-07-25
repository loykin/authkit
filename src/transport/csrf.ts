export interface CsrfStrategy {
  apply(request: Request): Request | Promise<Request>
  reset?(): void
}

export function defineCsrfStrategy(strategy: CsrfStrategy): CsrfStrategy {
  return strategy
}
