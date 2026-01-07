/**
 * React Context for Authentication
 */

import { createContext } from 'react';
import type { User } from '../core/types';

export interface AuthContextValue {
  // State
  isAuthenticated: boolean;
  loading: boolean;
  isRefreshingToken: boolean;
  user: User | null;
  
  // Actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (credentials: any) => Promise<{ success: boolean; error?: string; message?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<User | null>;
  refreshAccessToken: () => Promise<boolean>;
  updateUser: (userData: Partial<User>) => Promise<{ success: boolean; error?: string; user?: Partial<User> }>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  googleLogin: (redirectPath?: string) => void;
  microsoftLogin: (redirectPath?: string) => void;
  checkAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export default AuthContext;
