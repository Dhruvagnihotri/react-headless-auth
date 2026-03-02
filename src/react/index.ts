'use client';

/**
 * React layer exports
 * Use this when building React applications
 */

// Provider and Context
export { AuthProvider } from './AuthProvider';
export { AuthContext } from './AuthContext';

// Hooks
export { useAuth, useUser, useSession, useRole, useSessions, useAuditLogs } from './hooks';
export type { UseRoleReturn, UseSessionsReturn, Session, UseAuditLogsReturn, AuditLog, ActivityLog } from './hooks';

// RBAC Components
export { PermissionGate, RoleGate, SessionManager, AuditLogViewer } from './components';
export type { PermissionGateProps } from './components';

// Types
export type { AuthContextValue } from './AuthContext';

// Core exports (for advanced usage)
export { AuthClient, TokenStorage, LocalStorageAdapter } from '../core';
export { RBACClient } from '../core/RBACClient';
export type { 
  User,
  Role,
  Permission,
  CreateRoleInput,
  UpdateRoleInput,
  CreatePermissionInput,
  RBACConfig,
  AuthTokens, 
  AuthConfig,
  StorageAdapter,
  LoginCredentials,
  SignupCredentials 
} from '../core';

// Extensibility (for custom hooks)
export { HookManager } from '../extensibility';
export type { AuthHook, HookHandler, HookContext } from '../extensibility';
