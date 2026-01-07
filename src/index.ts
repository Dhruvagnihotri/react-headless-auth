/**
 * @headlesskit/react-auth
 * Production-ready, headless authentication for React
 * 
 * @packageDocumentation
 */

// Main React exports
export { AuthProvider } from './react/AuthProvider';
export type { AuthProviderProps } from './react/AuthProvider';
export { useAuth, useUser, useSession } from './react/hooks';
export type { AuthContextValue } from './react/AuthContext';

// Core exports (for advanced users)
export { AuthClient } from './core/AuthClient';
export { TokenStorage, LocalStorageAdapter } from './core/TokenStorage';

// Types
export type {
  User,
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
