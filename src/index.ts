/**
 * @headlesskit/react-auth
 * Production-ready, headless authentication with RBAC for React
 * 
 * @packageDocumentation
 */

// Main React exports
export { AuthProvider } from './react/AuthProvider';
export type { AuthProviderProps } from './react/AuthProvider';
export { useAuth, useUser, useSession, useRole, useSessions, useAuditLogs, useAdmin } from './react/hooks';
export type { UseRoleReturn, UseSessionsReturn, Session, UseAuditLogsReturn, AuditLog, ActivityLog, UseAdminReturn, UseAdminConfig } from './react/hooks';
export type { AuthContextValue } from './react/AuthContext';

// RBAC Components
export { PermissionGate, RoleGate, SessionManager, AuditLogViewer } from './react/components';
export type { PermissionGateProps } from './react/components';

// Core exports (for advanced users)
export { AuthClient } from './core/AuthClient';
export { RBACClient } from './core/RBACClient';
export { AdminClient } from './core/AdminClient';
export { TokenStorage, LocalStorageAdapter } from './core/TokenStorage';
export { AsyncStorageAdapter } from './core/AsyncStorageAdapter';
export type { AsyncStorageInterface } from './core/AsyncStorageAdapter';
export type {
  AdminClientConfig,
  AdminUser,
  ListUsersParams,
  ListUsersResponse,
  GetUserResponse,
  CreateUserInput,
  BanUserInput,
  AdminSession,
} from './core/AdminClient';

// Types
export type {
  User,
  Role,
  Permission,
  CreateRoleInput,
  UpdateRoleInput,
  CreatePermissionInput,
  RBACConfig,
  AdminConfig,
  AuditConfig,
  AuthTokens,
  LoginCredentials,
  SignupCredentials,
  AuthResponse,
  UpdateUserData,
  AuthConfig,
  AuthEndpoints,
  StorageStrategy,
  StorageAdapter,
} from './core/types';

// Extensibility
export { HookManager } from './extensibility/hooks';
export type { AuthHook, HookHandler, HookHandlers, HookContext } from './extensibility/hooks';

// Configuration
export { validateConfig, ConfigValidationError } from './config/validator';
export { DEFAULT_AUTH_CONFIG, DEFAULT_ENDPOINTS } from './config/defaults';

// Helpers
export { createAuthFetch, useAuthFetch } from './helpers/fetchWithAuth';
export type { FetchWithAuthOptions } from './helpers/fetchWithAuth';
