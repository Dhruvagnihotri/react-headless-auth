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
  signup: '/register',
  checkAuth: '/check-auth',
  userMe: '/user/@me',
  tokenRefresh: '/token/refresh',
  updateUser: '/update_user',
  updatePassword: '/update_user',
  googleLogin: '/login/google',
  microsoftLogin: '/login/microsoft',
  requestPasswordReset: '/request-password-reset',
  resetPassword: '/reset-password',
  resendVerification: '/resend-verification-email',
  uploadProfilePicture: '/upload-profile-picture',
  verifyMfa: '/verify-mfa',
};

/**
 * Main authentication client
 */
export class AuthClient {
  private config: Required<AuthConfig>;
  private storage: TokenStorage;
  private endpoints: AuthEndpoints;
  private refreshPromise: Promise<boolean> | null = null;
  private refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(config: AuthConfig, storage: TokenStorage) {
    // Apply defaults
    const apiPrefix = config.apiPrefix ?? '/api/auth';
    // Derive sibling prefixes from apiPrefix (e.g. /api/mrscribe/auth → /api/mrscribe/rbac)
    const basePrefix = apiPrefix.replace(/\/auth$/, '');

    this.config = {
      apiBaseUrl: config.apiBaseUrl,
      apiPrefix,
      storageStrategy: config.storageStrategy ?? 'cookie-first',
      tokenRefreshInterval: config.tokenRefreshInterval ?? 55 * 60 * 1000,
      enableGoogle: config.enableGoogle ?? false,
      enableMicrosoft: config.enableMicrosoft ?? false,
      googleClientId: config.googleClientId ?? '',
      microsoftClientId: config.microsoftClientId ?? '',
      enablePostHog: config.enablePostHog ?? false,
      posthogApiKey: config.posthogApiKey ?? '',
      rbac: config.rbac ?? { rbacPrefix: `${basePrefix}/rbac`, autoFetchPermissions: true, permissionCacheTTL: 300000 },
      admin: config.admin ?? { adminPrefix: `${basePrefix}/admin` },
      audit: config.audit ?? { auditPrefix: `${basePrefix}/audit` },
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
   * Decode JWT token to extract expiry and other claims
   */
  private decodeJWT(token: string): { exp?: number; iat?: number } | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch (error) {
      if (this.config.debug) {
        console.warn('[AuthClient] Failed to decode JWT:', error);
      }
      return null;
    }
  }

  /**
   * Schedule token refresh based on JWT expiry
   */
  private scheduleTokenRefresh(token: string): void {
    // Clear existing timeout
    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId);
      this.refreshTimeoutId = null;
    }

    const payload = this.decodeJWT(token);
    
    if (payload?.exp) {
      // JWT has expiry - refresh 5 minutes before expiration
      const expiryTime = payload.exp * 1000;
      const refreshTime = expiryTime - (5 * 60 * 1000);
      const delay = Math.max(0, refreshTime - Date.now());
      
      if (this.config.debug) {
        console.log(`[AuthClient] Scheduling token refresh in ${Math.floor(delay / 1000)}s (expires at ${new Date(expiryTime).toISOString()})`);
      }
      
      this.refreshTimeoutId = setTimeout(async () => {
        if (this.config.debug) {
          console.log('[AuthClient] JWT-aware token refresh triggered');
        }
        await this.refreshToken();
      }, delay);
    } else {
      // No JWT expiry found - fallback to interval-based (50 minutes)
      const fallbackDelay = 50 * 60 * 1000;
      
      if (this.config.debug) {
        console.log(`[AuthClient] No JWT expiry found, using fallback refresh in ${fallbackDelay / 1000}s`);
      }
      
      this.refreshTimeoutId = setTimeout(async () => {
        await this.refreshToken();
      }, fallbackDelay);
    }
  }

  /**
   * Clear refresh schedule
   */
  clearRefreshSchedule(): void {
    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId);
      this.refreshTimeoutId = null;
    }
  }

  /**
   * Make authenticated request with automatic 401 retry
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    includeAuth: boolean = false,
    retryOn401: boolean = true
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

    // Handle 401 - token might be corrupted/expired
    if (response.status === 401 && includeAuth && retryOn401) {
      if (this.config.debug) {
        console.warn('[AuthClient] Got 401, token may be corrupted/expired. Attempting refresh...');
      }
      
      const refreshed = await this.refreshToken();
      
      if (refreshed) {
        if (this.config.debug) {
          console.log('[AuthClient] Refresh successful, retrying original request');
        }
        // Retry the original request (but don't retry again to avoid infinite loop)
        return this.request<T>(endpoint, options, includeAuth, false);
      } else {
        // Refresh failed - token is truly invalid or refresh token expired
        if (this.config.debug) {
          console.error('[AuthClient] Refresh failed, clearing tokens');
        }
        await this.storage.clearTokens();
        throw new Error('Authentication failed: Invalid or expired token');
      }
    }

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
   * Update user data (profile fields, or password via { password } key)
   */
  async updateUser(data: UpdateUserData): Promise<User> {
    const response = await this.request<{ user: User; message?: string }>(
      this.endpoints.updateUser,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true
    );
    return response.user;
  }

  /**
   * Update password via the update_user endpoint.
   * Backend accepts { password: "newPass" } on POST /update_user.
   * currentPassword is included for backends that require verification.
   */
  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request(
      this.endpoints.updatePassword,
      {
        method: 'POST',
        body: JSON.stringify({ password: newPassword, current_password: currentPassword }),
      },
      true
    );
  }

  /**
   * Request a password reset email
   */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      this.endpoints.requestPasswordReset,
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      }
    );
  }

  /**
   * Complete password reset with token and new password
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `${this.endpoints.resetPassword}/${token}`,
      {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      }
    );
  }

  /**
   * Resend email verification
   */
  async resendVerificationEmail(): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      this.endpoints.resendVerification,
      { method: 'POST' },
      true
    );
  }

  /**
   * Upload profile picture (multipart/form-data)
   */
  async uploadProfilePicture(file: File | Blob): Promise<{ message: string; url?: string }> {
    const formData = new FormData();
    formData.append('profile_picture', file);

    const url = this.getUrl(this.endpoints.uploadProfilePicture);
    const headers: Record<string, string> = { ...this.config.customHeaders };
    const usingLocalStorage = await this.storage.shouldUseLocalStorage();
    if (usingLocalStorage) {
      const accessToken = await this.storage.getAccessToken();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    }
    // Do NOT set Content-Type — browser sets multipart boundary automatically
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Verify MFA token
   */
  async verifyMfa(email: string, mfaToken: string): Promise<AuthResponse> {
    return this.request<AuthResponse>(
      this.endpoints.verifyMfa,
      {
        method: 'POST',
        body: JSON.stringify({ email, mfa_token: mfaToken }),
      }
    );
  }

  /**
   * Get access token for making authenticated API calls
   * Returns token string for localStorage mode, or null for cookie mode
   * 
   * In cookie mode, users should use credentials: 'include' in their fetch calls
   * In localStorage mode, users should add Authorization: Bearer <token> header
   * 
   * @param options.forceRefresh - Force refresh token before returning (default: false)
   * @returns Token string or null (null means cookie mode)
   */
  async getAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string | null> {
    const usingLocalStorage = await this.storage.shouldUseLocalStorage();
    
    // Cookie mode - no token to return, cookies are sent automatically
    if (!usingLocalStorage) {
      if (this.config.debug) {
        console.log('[AuthClient] Cookie mode: No token needed, use credentials: "include"');
      }
      
      // If force refresh requested, do it but still return null (cookie mode)
      if (options.forceRefresh) {
        await this.refreshToken();
      }
      
      return null;
    }
    
    // localStorage mode - return token string
    let token = await this.storage.getAccessToken();
    
    // If force refresh or no token, try to refresh
    if (options.forceRefresh || !token) {
      if (this.config.debug) {
        console.log('[AuthClient] Refreshing token...');
      }
      
      const refreshed = await this.refreshToken();
      if (refreshed) {
        token = await this.storage.getAccessToken();
      }
    }
    
    if (this.config.debug) {
      console.log('[AuthClient] Returning access token:', token ? 'present' : 'not found');
    }
    
    return token;
  }

  /**
   * Refresh access token with race condition protection
   */
  async refreshToken(): Promise<boolean> {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      if (this.config.debug) {
        console.log('[AuthClient] Refresh already in progress, waiting...');
      }
      return this.refreshPromise;
    }

    this.refreshPromise = this._performRefresh();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    
    return result;
  }

  /**
   * Internal refresh implementation
   */
  private async _performRefresh(): Promise<boolean> {
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
          if (this.config.debug) {
            console.warn('[AuthClient] No refresh token found in localStorage');
          }
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
        if (this.config.debug) {
          console.warn(`[AuthClient] Refresh failed with status ${response.status}`);
        }
        // Clear tokens if refresh fails (corrupted or expired refresh token)
        await this.storage.clearTokens();
        this.clearRefreshSchedule();
        return false;
      }

      const data = await response.json();

      // Update tokens if in localStorage mode
      if (data.access_token && data.refresh_token && usingLocalStorage) {
        await this.storage.setTokens(data.access_token, data.refresh_token);
        
        // Schedule next refresh based on new token
        this.scheduleTokenRefresh(data.access_token);
      } else if (data.access_token) {
        // Cookie mode - schedule based on access token from response
        this.scheduleTokenRefresh(data.access_token);
      }

      if (this.config.debug) {
        console.log('[AuthClient] Token refresh successful');
      }

      return true;
    } catch (error) {
      if (this.config.debug) {
        console.error('[AuthClient] Token refresh failed:', error);
      }
      // Clear tokens on error
      await this.storage.clearTokens();
      this.clearRefreshSchedule();
      return false;
    }
  }

  /**
   * Get OAuth login URL
   * @param provider - OAuth provider ('google' | 'microsoft')
   * @param redirectUri - Frontend redirect URI after OAuth
   * @param customParams - Optional key-value pairs passed as query params to the backend.
   *   The backend stores them in the OAuth state and exposes them via
   *   `g.oauth_custom_data` for after_request hooks (e.g. promo codes).
   */
  getOAuthUrl(provider: 'google' | 'microsoft', redirectUri?: string, customParams?: Record<string, string>): string {
    const endpoint = provider === 'google' ? this.endpoints.googleLogin : this.endpoints.microsoftLogin;
    const url = this.getUrl(endpoint);
    
    const finalRedirectUri = redirectUri || (typeof window !== 'undefined' ? window.location.origin : '');
    
    const params = new URLSearchParams({ redirect_uri: finalRedirectUri });
    if (customParams) {
      for (const [key, value] of Object.entries(customParams)) {
        if (value) params.set(key, value);
      }
    }
    
    return `${url}?${params.toString()}`;
  }

  /**
   * Initialize JWT-aware refresh after login/signup
   * Should be called after successful authentication
   */
  initializeRefreshSchedule(accessToken: string): void {
    this.scheduleTokenRefresh(accessToken);
  }

  /**
   * Get configuration
   */
  getConfig(): Required<AuthConfig> {
    return { ...this.config };
  }

  /**
   * Cleanup on logout
   */
  async cleanup(): Promise<void> {
    this.clearRefreshSchedule();
    this.refreshPromise = null;
  }
}

export default AuthClient;
