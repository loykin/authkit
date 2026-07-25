import type { AuthPermissionRequest } from '../types'

export type PermissionRequestNormalizer<PermissionRequest extends AuthPermissionRequest> = (
  key: string,
) => PermissionRequest

export function defaultNormalizePermissionRequest<PermissionRequest extends AuthPermissionRequest>(
  key: string,
): PermissionRequest {
  return { action: key, resource: key } as PermissionRequest
}

export function normalizePermissionRequest<PermissionRequest extends AuthPermissionRequest>(
  request: PermissionRequest | string,
  normalizer: PermissionRequestNormalizer<PermissionRequest> = defaultNormalizePermissionRequest,
): PermissionRequest {
  return typeof request === 'string' ? normalizer(request) : request
}
