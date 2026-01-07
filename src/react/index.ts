'use client';

/**
 * React layer exports
 * Use this when building React applications
 */

// Provider and Context
export { AuthProvider } from './AuthProvider';
export { AuthContext } from './AuthContext';

// Hooks
export { useAuth, useUser, useSession } from './hooks';

// Types
export type { AuthContextValue } from './AuthContext';

// Core exports (for advanced usage)
export { AuthClient, TokenStorage, LocalStorageAdapter } from '../core';
export type { 
  User, 
  AuthTokens, 
  AuthConfig,
  StorageAdapter,
  LoginCredentials,
  SignupCredentials 
} from '../core';

// Extensibility (for custom hooks)
export { HookManager } from '../extensibility';
export type { HookType, HookCallback, HookContext } from '../extensibility';
