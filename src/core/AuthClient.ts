/**
 * AuthClient - Core authentication API client
 * Framework-agnostic, can be used in any JavaScript environment
 */

import type {
  AuthConfig,
  LoginCredentials,
  SignupCredentials,
  AuthResponse,
  User,
  AuthTokens,
  UpdateUserData,
  AuthEndpoints,
} from './types';
import { TokenStorage } from './TokenStorage';

/**
 * Default API endpoints
 */
const DEFAULT_ENDPOINTS: AuthEndpoints = {
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

/**
 * Main authentication client
 */
export class AuthClient {
  private config: Required<AuthConfig>;
  private storage: TokenStorage;
  private endpoints: AuthEndpoints;

  constructor(config: AuthConfig, storage: TokenStorage) {
    // Apply defaults
    this.config = {
      apiBaseUrl: config.apiBaseUrl,
      apiPrefix: config.apiPrefix ?? '/api/auth',
      storageStrategy: config.storageStrategy ?? 'cookie-first',
      tokenRefreshInterval: config.tokenRefreshInterval ?? 55 * 60 * 1000,
      enableGoogle: config.enableGoogle ?? false,
      enableMicrosoft: config.enableMicrosoft ?? false,
      googleClientId: config.googleClientId ?? '',
      microsoftClientId: config.microsoftClientId ?? '',
      enablePostHog: config.enablePostHog ?? false,
      posthogApiKey: config.posthogApiKey ?? '',
      customHeaders: config.customHeaders ?? {},
      endpoints: config.endpoints ?? {},
      debug: config.debug ?? false,
      logLevel: config.logLevel ?? 'warn',
    };

    this.storage = storage;
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...config.endpoints };

    if (this.config.debug) {
      console.log('[AuthClient] Initialized with config:', this.config);
    }
  }

  /**
   * Build full API URL
   */
  private getUrl(endpoint: string): string {
    return `${this.config.apiBaseUrl}${this.config.apiPrefix}${endpoint}`;
  }

  /**
   * Create request headers
   */
  private async createHeaders(includeAuth: boolean = false): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.customHeaders,
    };

    if (includeAuth) {
      const usingLocalStorage = await this.storage.shouldUseLocalStorage();
      if (usingLocalStorage) {
        const accessToken = await this.storage.getAccessToken();
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }
      }
    }

    return headers;
  }

  /**
   * Make authenticated request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    includeAuth: boolean = false
  ): Promise<T> {
    const url = this.getUrl(endpoint);
    const headers = await this.createHeaders(includeAuth);

    if (this.config.debug) {
      console.log('[AuthClient] Request:', url, options);
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
      credentials: 'include', // Always include cookies
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>(
      this.endpoints.login,
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );

    return response;
  }

  /**
   * Signup new user
   */
  async signup(credentials: SignupCredentials): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>(
      this.endpoints.signup,
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      }
    );

    return response;
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    await this.request(
      this.endpoints.logout,
      {
        method: 'POST',
      },
      true // Include auth
    );

    await this.storage.clearTokens();
  }

  /**
   * Check authentication status
   */
  async checkAuth(): Promise<boolean> {
    try {
      const response = await this.request<{ authenticated: boolean }>(
        this.endpoints.checkAuth,
        { method: 'GET' },
        true
      );
      return response.authenticated ?? true;
    } catch {
      return false;
    }
  }

  /**
   * Get current user data
   */
  async getUser(): Promise<User> {
    const response = await this.request<{ user: User }>(
      this.endpoints.userMe,
      { method: 'GET' },
      true
    );
    return response.user;
  }

  /**
   * Update user data
   */
  async updateUser(data: UpdateUserData): Promise<User> {
    const response = await this.request<{ user: User }>(
      this.endpoints.updateUser,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
      true
    );
    return response.user;
  }

  /**
   * Update password
   */
  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request(
      this.endpoints.updatePassword,
      {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      },
      true
    );
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<boolean> {
    try {
      const usingLocalStorage = await this.storage.shouldUseLocalStorage();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (usingLocalStorage) {
        const refreshToken = await this.storage.getRefreshToken();
        if (refreshToken) {
          headers['Authorization'] = `Bearer ${refreshToken}`;
        } else {
          return false;
        }
      }

      const url = this.getUrl(this.endpoints.tokenRefresh);
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers,
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();

      // Update tokens if in localStorage mode
      if (data.access_token && data.refresh_token && usingLocalStorage) {
        await this.storage.setTokens(data.access_token, data.refresh_token);
      }

      return true;
    } catch (error) {
      if (this.config.debug) {
        console.error('[AuthClient] Token refresh failed:', error);
      }
      return false;
    }
  }

  /**
   * Get OAuth login URL
   */
  getOAuthUrl(provider: 'google' | 'microsoft', redirectUri?: string): string {
    const endpoint = provider === 'google' ? this.endpoints.googleLogin : this.endpoints.microsoftLogin;
    const url = this.getUrl(endpoint);
    
    const finalRedirectUri = redirectUri || (typeof window !== 'undefined' ? window.location.origin : '');
    
    return `${url}?redirect_uri=${encodeURIComponent(finalRedirectUri)}`;
  }

  /**
   * Get configuration
   */
  getConfig(): Required<AuthConfig> {
    return { ...this.config };
  }
}

export default AuthClient;
