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
  changeEmail: '/change-email',
  deleteAccount: '/delete-account',
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

  // Cross-tab refresh coordination. `refreshPromise` above only dedupes
  // concurrent calls WITHIN one AuthClient instance - each browser tab
  // gets its own instance (see AuthProvider's useMemo), so two tabs whose
  // JWTs happen to expire around the same moment can each independently
  // decide to POST tokenRefresh at once. Depending on the backend's
  // refresh-token semantics (single-use rotation with the old token
  // blacklisted, vs. reusable until expiry) the loser can get a 401 and
  // be treated as "session expired" by its tab even though the winner's
  // tab is still validly logged in. This uses a localStorage-based lock
  // (not BroadcastChannel, for broader/older browser support and because
  // this file already assumes localStorage may be present via
  // TokenStorage) so a tab that sees another tab mid-refresh waits for it
  // instead of racing it.
  private readonly instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private static readonly REFRESH_LOCK_KEY = '__auth_refresh_lock__';
  // Floor on the proactive-refresh delay computed in scheduleTokenRefresh.
  // The primary fix for the incident below is scheduling from the token's
  // own exp/iat claim interval (skew-immune - see scheduleTokenRefresh),
  // but this floor stays as a backstop for the exp-only branch (no iat
  // claim) and for any other bug that could feed a negative/near-zero
  // delay: a device with a skewed clock comparing a server-issued `exp`
  // against its own Date.now() sees "refreshTime - Date.now()" as already
  // negative on every single refresh, since the server always issues a
  // correctly-dated token and the skew never corrects itself - Math.max(0,
  // ...) alone let that reschedule fire again immediately, forever, bound
  // only by network round-trip time. Confirmed in production: one account
  // with a skewed clock generated ~880K token.refresh audit rows over
  // several days (up to ~4.4/sec sustained for a full day) before
  // self-resolving. The reactive 401-triggered refresh (AuthClient.request
  // and the standalone createAuthFetch helper) is entirely separate from
  // this scheduling path and still refreshes immediately when a request
  // actually needs it, regardless of this floor.
  private static readonly MIN_PROACTIVE_REFRESH_DELAY_MS = 60_000;
  // Safety valve, not a normal-case timeout: if a tab crashes/navigates
  // away mid-refresh, its lock would otherwise never clear and every
  // other tab would wait forever. A real refresh completes in well under
  // this window; it only matters when something already went wrong.
  private static readonly REFRESH_LOCK_TTL_MS = 10_000;

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

      // JWT payload segments are base64url (RFC 7519), not standard base64:
      // '-'/'_' instead of '+'/'/', and no padding. atob() only accepts
      // standard base64 and throws on '-'/'_', which real flask-jwt-extended
      // tokens contain often enough (any payload of a few hundred bytes) to
      // make this fail unpredictably depending on token content - falling
      // through to the 50-minute fallback schedule below, well past a
      // 15-minute token's actual expiry.
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
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
    const leadMs = 5 * 60 * 1000;

    if (payload?.exp && payload?.iat) {
      // Both exp and iat are timestamps the SERVER issued - their
      // difference is a pure duration with no client Date.now() in it at
      // all, so client clock skew cannot affect it. setTimeout measures
      // real elapsed time from now regardless of what the client's clock
      // claims "now" is, so scheduling from this duration (rather than
      // comparing an absolute server timestamp against Date.now(), as the
      // exp-only branch below still does) is genuinely skew-immune, not
      // just bounded by the floor.
      const tokenLifetimeMs = (payload.exp - payload.iat) * 1000;
      const delay = Math.max(AuthClient.MIN_PROACTIVE_REFRESH_DELAY_MS, tokenLifetimeMs - leadMs);

      if (this.config.debug) {
        console.log(`[AuthClient] Scheduling token refresh in ${Math.floor(delay / 1000)}s (claim-interval, skew-immune)`);
      }

      this.refreshTimeoutId = setTimeout(async () => {
        if (this.config.debug) {
          console.log('[AuthClient] JWT-aware token refresh triggered');
        }
        await this.refreshToken();
      }, delay);
    } else if (payload?.exp) {
      // No iat claim to derive a skew-immune duration from - fall back to
      // comparing the server's exp against this device's own clock. The
      // floor still bounds the damage if that clock is skewed, but can't
      // eliminate the loop the way the branch above does.
      const expiryTime = payload.exp * 1000;
      const refreshTime = expiryTime - leadMs;
      const delay = Math.max(AuthClient.MIN_PROACTIVE_REFRESH_DELAY_MS, refreshTime - Date.now());

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
   * Try to take the cross-tab refresh lock. Returns true if this tab now
   * holds it (proceed with the actual refresh), false if another tab
   * already holds a non-stale lock (wait on it instead - see
   * waitForOtherTabRefresh). Fails OPEN (returns true) whenever
   * localStorage isn't usable - SSR, React Native, privacy modes that
   * block storage, etc. - so environments without cross-tab risk (or
   * without the means to coordinate at all) get exactly today's
   * single-tab-safe behavior, never worse.
   */
  private acquireRefreshLock(): boolean {
    if (typeof window === 'undefined') return true;
    try {
      // The `.localStorage` property read itself, not just the methods
      // called on it, can throw in some environments (a sandboxed iframe
      // without allow-same-origin, certain legacy private-browsing
      // modes) - reading it inside this try, not in a guard above it,
      // is what keeps this failing open in those cases too.
      if (!window.localStorage) return true;
      const raw = window.localStorage.getItem(AuthClient.REFRESH_LOCK_KEY);
      if (raw) {
        const existing = JSON.parse(raw) as { id: string; ts: number };
        if (Date.now() - existing.ts < AuthClient.REFRESH_LOCK_TTL_MS) {
          return false;
        }
        // Stale lock from a crashed/navigated-away tab - fine to take over.
      }

      const mine = { id: this.instanceId, ts: Date.now() };
      window.localStorage.setItem(AuthClient.REFRESH_LOCK_KEY, JSON.stringify(mine));

      // localStorage has no atomic compare-and-set, so two tabs writing in
      // the same instant would both believe they'd won (last write simply
      // wins silently). Re-reading right after writing can't make this
      // fully atomic either, but it narrows the race from "whenever both
      // tabs' refresh timers/401s happen to land close together" (the bug
      // this fix exists for) down to "the same microsecond" - and even in
      // that residual case, the outcome is no worse than before this fix
      // existed (both tabs proceed).
      const confirm = window.localStorage.getItem(AuthClient.REFRESH_LOCK_KEY);
      return confirm === JSON.stringify(mine);
    } catch {
      return true;
    }
  }

  /**
   * Release the cross-tab refresh lock, but only if this tab still holds
   * it (never clear a lock some other tab has since taken, e.g. after
   * this one's lock went stale and was overtaken).
   */
  private releaseRefreshLock(): void {
    if (typeof window === 'undefined') return;
    try {
      // See the matching comment in acquireRefreshLock - the property
      // read itself belongs inside the try, not guarded above it.
      if (!window.localStorage) return;
      const raw = window.localStorage.getItem(AuthClient.REFRESH_LOCK_KEY);
      if (!raw) return;
      const existing = JSON.parse(raw) as { id: string; ts: number };
      if (existing.id === this.instanceId) {
        window.localStorage.removeItem(AuthClient.REFRESH_LOCK_KEY);
      }
    } catch {
      // Best-effort - a leftover lock just falls back to the TTL above.
    }
  }

  /**
   * Wait for another tab's in-flight refresh to finish, instead of
   * starting a redundant/racing one of our own. Resolves `true` either
   * way once the other tab's lock clears (or the TTL safety valve fires)
   * - this deliberately does not try to know whether the OTHER tab's
   * refresh actually succeeded. If it didn't, the request that triggered
   * this call gets its own 401 on retry and fails through the normal,
   * already-correct single-tab path; this only removes the redundant
   * network call in the common, harmless case.
   */
  private waitForOtherTabRefresh(): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const finish = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener('storage', onStorage);
        clearTimeout(timeoutId);
        resolve(true);
      };

      // `storage` events fire only in OTHER tabs/windows, never the tab
      // that made the change - exactly the cross-tab-only signal wanted
      // here, with no risk of a tab reacting to its own write.
      const onStorage = (event: StorageEvent) => {
        if (event.key === AuthClient.REFRESH_LOCK_KEY && event.newValue === null) {
          finish();
        }
      };
      window.addEventListener('storage', onStorage);

      timeoutId = setTimeout(finish, AuthClient.REFRESH_LOCK_TTL_MS);
    });
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
        throw new Error(`Authentication failed (401): Invalid or expired token`);
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData.error || errorData.message || 'Unknown error';
      throw new Error(`Request failed (${response.status}): ${detail}`);
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
   * Change the authenticated user's email address.
   * Backend re-issues tokens bound to the new email (body + cookies) and
   * marks the account unverified pending re-verification.
   */
  async changeEmail(newEmail: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>(
      this.endpoints.changeEmail,
      {
        method: 'POST',
        body: JSON.stringify({ new_email: newEmail, password }),
      },
      true
    );
  }

  /**
   * Permanently delete the authenticated user's account.
   * Backend blacklists the current token and clears auth cookies.
   */
  async deleteAccount(password?: string): Promise<{ message: string }> {
    const result = await this.request<{ message: string }>(
      this.endpoints.deleteAccount,
      {
        method: 'POST',
        body: JSON.stringify(password ? { password } : {}),
      },
      true
    );
    await this.storage.clearTokens();
    return result;
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
    // Prevent multiple simultaneous refresh attempts within this tab
    if (this.refreshPromise) {
      if (this.config.debug) {
        console.log('[AuthClient] Refresh already in progress, waiting...');
      }
      return this.refreshPromise;
    }

    if (!this.acquireRefreshLock()) {
      if (this.config.debug) {
        console.log('[AuthClient] Another tab is refreshing, waiting for it instead of racing...');
      }
      return this.waitForOtherTabRefresh();
    }

    this.refreshPromise = this._performRefresh();
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
      this.releaseRefreshLock();
    }
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
