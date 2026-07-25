export function createRefreshCoordinator(refresh: () => Promise<boolean>): () => Promise<boolean> {
  let inFlight: Promise<boolean> | null = null

  return function coordinatedRefresh(): Promise<boolean> {
    if (inFlight) return inFlight

    inFlight = refresh().finally(() => {
      inFlight = null
    })

    return inFlight
  }
}
