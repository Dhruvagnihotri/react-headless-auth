/**
 * AsyncStorage Adapter for React Native
 * 
 * This adapter allows react-headless-auth to work with React Native's AsyncStorage.
 * It bridges the async AsyncStorage API with the library's storage interface.
 * 
 * Usage:
 * ```typescript
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * import { AuthProvider, AsyncStorageAdapter } from '@headlesskits/react-headless-auth';
 * 
 * const adapter = new AsyncStorageAdapter(AsyncStorage);
 * 
 * <AuthProvider
 *   config={{
 *     apiBaseUrl: 'https://api.example.com',
 *     apiPrefix: '/api/auth',
 *     storageStrategy: 'localStorage-only', // Use localStorage strategy for React Native
 *   }}
 *   storageAdapter={adapter}
 * >
 *   {children}
 * </AuthProvider>
 * ```
 */

import type { StorageAdapter } from './types';

// Default storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'auth_access_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  COOKIES_BLOCKED: 'auth_cookies_blocked',
} as const;

/**
 * Interface that AsyncStorage must implement
 * This matches @react-native-async-storage/async-storage
 */
export interface AsyncStorageInterface {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  multiRemove(keys: string[]): Promise<void>;
}

/**
 * AsyncStorage adapter for React Native
 * Implements the StorageAdapter interface using React Native's AsyncStorage
 */
export class AsyncStorageAdapter implements StorageAdapter {
  private storage: AsyncStorageInterface;

  constructor(asyncStorageInstance: AsyncStorageInterface) {
    this.storage = asyncStorageInstance;
  }

  /**
   * Get item from AsyncStorage
   */
  async getItem(key: string): Promise<string | null> {
    try {
      return await this.storage.getItem(key);
    } catch (error) {
      console.error('[AsyncStorageAdapter] Failed to get item:', error);
      return null;
    }
  }

  /**
   * Set item in AsyncStorage
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      await this.storage.setItem(key, value);
    } catch (error) {
      console.error('[AsyncStorageAdapter] Failed to set item:', error);
    }
  }

  /**
   * Remove item from AsyncStorage
   */
  async removeItem(key: string): Promise<void> {
    try {
      await this.storage.removeItem(key);
    } catch (error) {
      console.error('[AsyncStorageAdapter] Failed to remove item:', error);
    }
  }

  /**
   * Clear all auth-related items from AsyncStorage
   */
  async clear(): Promise<void> {
    try {
      await this.storage.multiRemove([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.COOKIES_BLOCKED,
      ]);
    } catch (error) {
      console.error('[AsyncStorageAdapter] Failed to clear storage:', error);
    }
  }
}

export default AsyncStorageAdapter;
