/**
 * Token Storage Management
 * Handles smart token storage with cookie-first strategy and localStorage fallback
 * 
 * Strategy:
 * 1. Cookie-First (Default): Uses HttpOnly cookies when available (most secure)
 * 2. localStorage-only: Fallback for when cookies are blocked
 * 3. Auto: Automatically detects and switches based on cookie availability
 */

import type { StorageStrategy, StorageAdapter } from './types';

// Default storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'auth_access_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  COOKIES_BLOCKED: 'auth_cookies_blocked',
} as const;

/**
 * Browser localStorage adapter
 */
export class LocalStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('Failed to set localStorage item:', error);
    }
  }

  removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove localStorage item:', error);
    }
  }

  clear(): void {
    if (typeof window === 'undefined') return;
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  }
}

/**
 * Main TokenStorage class
 * Manages token persistence with intelligent storage strategy
 */
export class TokenStorage {
  private adapter: StorageAdapter;
  private strategy: StorageStrategy;

  constructor(
    strategy: StorageStrategy = 'cookie-first',
    adapter: StorageAdapter = new LocalStorageAdapter()
  ) {
    this.strategy = strategy;
    this.adapter = adapter;
  }

  /**
   * Set tokens in storage
   */
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await this.adapter.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    await this.adapter.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    // Mark that we're using localStorage (cookies are blocked)
    await this.adapter.setItem(STORAGE_KEYS.COOKIES_BLOCKED, 'true');
  }

  /**
   * Get access token
   */
  async getAccessToken(): Promise<string | null> {
    return await this.adapter.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  }

  /**
   * Get refresh token
   */
  async getRefreshToken(): Promise<string | null> {
    return await this.adapter.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  }

  /**
   * Check if cookies are blocked (localStorage mode)
   */
  async areCookiesBlocked(): Promise<boolean> {
    const flag = await this.adapter.getItem(STORAGE_KEYS.COOKIES_BLOCKED);
    return flag === 'true';
  }

  /**
   * Clear all tokens
   */
  async clearTokens(): Promise<void> {
    await this.adapter.clear();
  }

  /**
   * Check if we should use localStorage
   */
  async shouldUseLocalStorage(): Promise<boolean> {
    if (this.strategy === 'localStorage-only') {
      return true;
    }

    const hasFlag = await this.areCookiesBlocked();
    const hasAccessToken = (await this.getAccessToken()) !== null;
    const hasRefreshToken = (await this.getRefreshToken()) !== null;

    // If flag is set or any token exists in localStorage, use localStorage mode
    return hasFlag || hasAccessToken || hasRefreshToken;
  }

  /**
   * Get storage strategy
   */
  getStrategy(): StorageStrategy {
    return this.strategy;
  }
}

export default TokenStorage;
