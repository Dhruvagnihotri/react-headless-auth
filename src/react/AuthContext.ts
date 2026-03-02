/**
 * React Context for Authentication
 */

import { createContext } from 'react';
import type { User, AuthConfig } from '../core/types';

export interface AuthContextValue {
  // State
  isAuthenticated: boolean;
  loading: boolean;
  isRefreshingToken: boolean;
  user: User | null;

  /** Resolved config (for child hooks to derive URLs) */
  config: Required<AuthConfig>;
  
  // Actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (credentials: any) => Promise<{ success: boolean; error?: string; message?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<User | null>;
  refreshAccessToken: () => Promise<boolean>;
  updateUser: (userData: Partial<User>) => Promise<{ success: boolean; error?: string; user?: Partial<User> }>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ message: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<{ message: string }>;
  resendVerificationEmail: () => Promise<{ message: string }>;
  uploadProfilePicture: (file: File | Blob) => Promise<{ message: string; url?: string }>;
  verifyMfa: (email: string, mfaToken: string) => Promise<any>;
  googleLogin: (redirectPath?: string) => void;
  microsoftLogin: (redirectPath?: string) => void;
  checkAuth: () => Promise<void>;
  
  /**
   * Get access token for making authenticated API calls
   * Returns token string for localStorage mode, or null for cookie mode
   * 
   * Usage:
   * ```typescript
   * const { getAccessToken } = useAuth();
   * const token = await getAccessToken();
   * 
   * // Make API call
   * const response = await fetch('/api/data', {
   *   headers: token ? { Authorization: `Bearer ${token}` } : {},
   *   credentials: 'include' // Always include for cookie mode
   * });
   * ```
   */
  getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export default AuthContext;
