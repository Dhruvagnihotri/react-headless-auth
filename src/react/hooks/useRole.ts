/**
 * useRole - Hook for role-based access checking
 * 
 * Provides utilities to check user roles and permissions from JWT claims.
 * Works with the flask-headless-auth RBAC system.
 * 
 * @example
 * ```tsx
 * const { role, hasRole, hasPermission, permissions } = useRole();
 * 
 * if (hasRole('admin')) {
 *   // Show admin features
 * }
 * 
 * if (hasPermission('patients.edit')) {
 *   // Show edit button
 * }
 * ```
 */

import { useMemo } from 'react';
import { useAuth } from './useAuth';

export interface UseRoleReturn {
  /** Current user's role object (null if no role) */
  role: { id?: number; name?: string } | null;
  /** Current user's role ID */
  roleId: number | null;
  /** Current user's role name */
  roleName: string | null;
  /** List of user's permission names */
  permissions: string[];
  /** Check if user has a specific role by name */
  hasRole: (roleName: string) => boolean;
  /** Check if user has ANY of the specified roles */
  hasAnyRole: (...roleNames: string[]) => boolean;
  /** Check if user has a specific permission */
  hasPermission: (permissionName: string) => boolean;
  /** Check if user has ALL of the specified permissions */
  hasAllPermissions: (...permissionNames: string[]) => boolean;
  /** Check if user has ANY of the specified permissions */
  hasAnyPermission: (...permissionNames: string[]) => boolean;
  /** Convenience: is the user an admin */
  isAdmin: boolean;
  /** Whether auth state is still loading */
  loading: boolean;
}

export function useRole(): UseRoleReturn {
  const { user, loading } = useAuth();
  
  // Extract role and permissions from user object
  // Supports both nested { role: { id, name } } and flat { role_id, role_name } formats
  const role = useMemo(() => {
    if (!user) return null;
    if (user.role && typeof user.role === 'object') return user.role;
    const id = user.role_id ?? undefined;
    const name = (user as any).role_name ?? undefined;
    if (id || name) return { id, name };
    return null;
  }, [user]);
  
  const roleId = user?.role_id ?? user?.role?.id ?? null;
  const roleName = (user as any)?.role_name ?? user?.role?.name ?? null;
  
  // Permissions come from user.permissions (populated by backend JWT claims or /me endpoint)
  const permissions = useMemo(() => {
    if (!user) return [];
    return user.permissions ?? [];
  }, [user]);
  
  // Permission set for O(1) lookups
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  
  const hasRole = (name: string): boolean => {
    if (!roleName) return false;
    return roleName === name;
  };
  
  const hasAnyRole = (...roleNames: string[]): boolean => {
    if (!roleName) return false;
    return roleNames.includes(roleName);
  };
  
  const hasPermission = (permissionName: string): boolean => {
    return permissionSet.has(permissionName);
  };
  
  const hasAllPermissions = (...permissionNames: string[]): boolean => {
    return permissionNames.every(p => permissionSet.has(p));
  };
  
  const hasAnyPermission = (...permissionNames: string[]): boolean => {
    return permissionNames.some(p => permissionSet.has(p));
  };
  
  const isAdmin = hasRole('admin');
  
  return {
    role,
    roleId,
    roleName,
    permissions,
    hasRole,
    hasAnyRole,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    isAdmin,
    loading,
  };
}

export default useRole;
