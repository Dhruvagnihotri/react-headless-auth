/**
 * Default configuration values
 */

import type { AuthConfig, AuthEndpoints } from '../core/types';

export const DEFAULT_AUTH_CONFIG: Partial<AuthConfig> = {
  apiPrefix: '/api/auth',
  storageStrategy: 'cookie-first',
  tokenRefreshInterval: 55 * 60 * 1000, // 55 minutes
  enableGoogle: false,
  enableMicrosoft: false,
  enablePostHog: false,
  debug: false,
  logLevel: 'warn',
  customHeaders: {},
};

export const DEFAULT_ENDPOINTS: AuthEndpoints = {
  login: '/login',
  logout: '/logout',
  signup: '/signup',
  checkAuth: '/check-auth',
  userMe: '/user/@me',
  tokenRefresh: '/token/refresh',
  updateUser: '/user/@me',
  updatePassword: '/password/update',
  googleLogin: '/login/google',
  microsoftLogin: '/login/microsoft',
};
