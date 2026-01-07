/**
 * Core type definitions for @headlesskit/react-auth
 * Framework-agnostic types that can be used anywhere
 */

export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_verified: boolean;
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
  success: boolean;
  user?: User;
  access_token?: string;
  refresh_token?: string;
  error?: string;
  message?: string;
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
}

export type StorageStrategy = 'cookie-first' | 'localStorage-only' | 'auto';

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
