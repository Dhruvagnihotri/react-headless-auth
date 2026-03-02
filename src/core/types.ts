/**
 * Core type definitions for @headlesskit/react-auth
 * Framework-agnostic types that can be used anywhere
 */

export interface User {
  id: string | number;
  username?: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  is_verified: boolean;
  is_active?: boolean;
  phone_number?: string;
  bio?: string;
  occupation?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zip_code?: string;
  profile_picture?: string;
  provider?: string;
  mfa_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string;
  
  // RBAC fields
  role_id?: number | null;
  role?: Role;
  role_name?: string | null;
  permissions?: string[];
  
  // Multi-tenancy / practice fields (app-specific, passed through)
  practice_id?: number | null;
  provider_type?: string | null;
  specialty?: string | null;
  license_number?: string | null;
  npi_number?: string | null;
  
  // Subscription fields (if using with payments package)
  plan?: string;
  plan_name?: string;
  status?: string;
  plan_status?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  trial_start?: string;
  trial_end?: string;
  is_subscribed?: boolean;
  is_on_trial?: boolean;
  days_until_renewal?: number;

  // Allow additional fields from custom user models
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// RBAC Types
// ---------------------------------------------------------------------------

export interface Role {
  id: number;
  name: string;
  display_name?: string;
  description?: string;
  is_system?: boolean;
  permissions?: Permission[];
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface Permission {
  id: number;
  name: string;
  display_name?: string;
  description?: string;
  category?: string;
  resource?: string;
  action?: string;
  is_system?: boolean;
  metadata?: Record<string, any>;
}

export interface CreateRoleInput {
  name: string;
  display_name?: string;
  description?: string;
  permission_ids?: number[];
}

export interface UpdateRoleInput {
  display_name?: string;
  description?: string;
}

export interface CreatePermissionInput {
  name: string;
  display_name?: string;
  description?: string;
  category?: string;
}

export interface RBACConfig {
  /** URL prefix for RBAC API endpoints (default: '/api/rbac') */
  rbacPrefix?: string;
  /** Auto-fetch permissions on login (default: true) */
  autoFetchPermissions?: boolean;
  /** Cache TTL for permissions in milliseconds (default: 300000 = 5 min) */
  permissionCacheTTL?: number;
}

export interface AdminConfig {
  /** URL prefix for Admin API endpoints (default: '/api/admin') */
  adminPrefix?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  username?: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  [key: string]: any;
}

export interface AuthResponse {
  success?: boolean;
  user?: User;
  access_token?: string;
  refresh_token?: string;
  error?: string;
  message?: string;
  msg?: string;
  // Allow additional fields from backend
  [key: string]: any;
}

export interface UpdateUserData {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  bio?: string;
  occupation?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zip_code?: string;
  /** Include to change password via update_user endpoint */
  password?: string;
  [key: string]: any;
}

export interface AuthEndpoints {
  login: string;
  logout: string;
  signup: string;
  checkAuth: string;
  userMe: string;
  tokenRefresh: string;
  updateUser: string;
  updatePassword: string;
  googleLogin: string;
  microsoftLogin: string;
  requestPasswordReset: string;
  resetPassword: string;
  resendVerification: string;
  uploadProfilePicture: string;
  verifyMfa: string;
}

export type StorageStrategy = 'cookie-first' | 'localStorage-only' | 'auto';

export interface AuditConfig {
  /** URL prefix for Audit API endpoints (default: derived from apiPrefix) */
  auditPrefix?: string;
}

export interface AuthConfig {
  // Required
  apiBaseUrl: string;
  
  // Optional with defaults
  apiPrefix?: string;
  storageStrategy?: StorageStrategy;
  tokenRefreshInterval?: number;
  
  // OAuth
  enableGoogle?: boolean;
  enableMicrosoft?: boolean;
  googleClientId?: string;
  microsoftClientId?: string;
  
  // Analytics
  enablePostHog?: boolean;
  posthogApiKey?: string;
  
  // RBAC
  rbac?: RBACConfig;
  
  // Admin user-management
  admin?: AdminConfig;

  // Audit & session management
  audit?: AuditConfig;
  
  // Customization
  customHeaders?: Record<string, string>;
  endpoints?: Partial<AuthEndpoints>;
  
  // Debugging
  debug?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
  clear(): void | Promise<void>;
}
