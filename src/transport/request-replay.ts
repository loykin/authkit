export function tryCloneRequest(request: Request): Request | null {
  try {
    return request.clone()
  } catch {
    return null
  }
}
