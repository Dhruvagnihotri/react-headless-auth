/**
 * PermissionGate - Conditionally render children based on permissions/roles.
 * 
 * A headless component that shows or hides content based on the current
 * user's permissions or role. Works with the flask-headless-auth RBAC system.
 * 
 * @example Permission-based gate
 * ```tsx
 * <PermissionGate permission="patients.edit">
 *   <EditButton />
 * </PermissionGate>
 * ```
 * 
 * @example Multiple permissions (require ALL)
 * ```tsx
 * <PermissionGate permissions={['patients.edit', 'patients.delete']} requireAll>
 *   <DangerZone />
 * </PermissionGate>
 * ```
 * 
 * @example Multiple permissions (require ANY)
 * ```tsx
 * <PermissionGate permissions={['patients.edit', 'billing.manage']}>
 *   <SomeFeature />
 * </PermissionGate>
 * ```
 * 
 * @example Role-based gate
 * ```tsx
 * <PermissionGate role="admin">
 *   <AdminPanel />
 * </PermissionGate>
 * ```
 * 
 * @example With fallback
 * ```tsx
 * <PermissionGate permission="billing.manage" fallback={<p>Access denied</p>}>
 *   <BillingDashboard />
 * </PermissionGate>
 * ```
 */

import React, { ReactNode } from 'react';
import { useRole } from '../hooks/useRole';

export interface PermissionGateProps {
  children: ReactNode;
  /** Single permission to check */
  permission?: string;
  /** Multiple permissions to check */
  permissions?: string[];
  /** If true, ALL permissions required. If false (default), ANY is sufficient. */
  requireAll?: boolean;
  /** Single role to check */
  role?: string;
  /** Multiple roles to check (ANY match grants access) */
  roles?: string[];
  /** Content to show if permission/role check fails */
  fallback?: ReactNode;
  /** Content to show while loading */
  loading?: ReactNode;
}

export function PermissionGate({
  children,
  permission,
  permissions,
  requireAll = false,
  role,
  roles,
  fallback = null,
  loading: loadingContent = null,
}: PermissionGateProps): React.ReactElement | null {
  const {
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    hasRole,
    hasAnyRole,
    loading,
  } = useRole();
  
  // Show loading state
  if (loading) {
    return loadingContent ? <>{loadingContent}</> : null;
  }
  
  // Check role-based access
  if (role && !hasRole(role)) {
    return <>{fallback}</>;
  }
  
  if (roles && roles.length > 0 && !hasAnyRole(...roles)) {
    return <>{fallback}</>;
  }
  
  // Check single permission
  if (permission && !hasPermission(permission)) {
    return <>{fallback}</>;
  }
  
  // Check multiple permissions
  if (permissions && permissions.length > 0) {
    const hasAccess = requireAll
      ? hasAllPermissions(...permissions)
      : hasAnyPermission(...permissions);
    
    if (!hasAccess) {
      return <>{fallback}</>;
    }
  }
  
  return <>{children}</>;
}

/**
 * RoleGate - Convenience alias for role-only checking.
 * 
 * @example
 * ```tsx
 * <RoleGate role="admin">
 *   <AdminPanel />
 * </RoleGate>
 * 
 * <RoleGate roles={['admin', 'provider']}>
 *   <ProviderTools />
 * </RoleGate>
 * ```
 */
export function RoleGate({
  children,
  role,
  roles,
  fallback = null,
  loading: loadingContent = null,
}: {
  children: ReactNode;
  role?: string;
  roles?: string[];
  fallback?: ReactNode;
  loading?: ReactNode;
}): React.ReactElement | null {
  return (
    <PermissionGate
      role={role}
      roles={roles}
      fallback={fallback}
      loading={loadingContent}
    >
      {children}
    </PermissionGate>
  );
}

export default PermissionGate;
