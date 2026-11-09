export function routeAccess(status, user, allowedRoles) {
  if (status === 'loading') return 'loading';
  if (status !== 'authenticated' || !user) return 'redirect';
  if (Array.isArray(allowedRoles) && allowedRoles.length && !allowedRoles.includes(user.role)) return 'forbidden';
  return 'allow';
}
