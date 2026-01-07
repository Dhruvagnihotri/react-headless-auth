/**
 * AuthProvider - Main React component for authentication
 * Extracted and refined from brakit-web and pdfwhiz_frontend
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import { AuthClient } from '../core/AuthClient';
import { TokenStorage } from '../core/TokenStorage';
import { HookManager } from '../extensibility/hooks';
import { validateConfig } from '../config/validator';
import type { AuthConfig, User } from '../core/types';
import type { HookHandlers } from '../extensibility/hooks';

export interface AuthProviderProps {
  children: ReactNode;
  config?: Partial<AuthConfig>;
  hooks?: HookHandlers;
  onReady?: () => void;
}

/**
 * Main AuthProvider component
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  config: userConfig,
  hooks: userHooks = {},
  onReady,
}) => {
  // Validate and normalize config
  const config = useMemo(() => {
    if (!userConfig?.apiBaseUrl) {
      throw new Error('@headlesskit/react-auth: apiBaseUrl is required in config');
    }
    return validateConfig(userConfig);
  }, [userConfig]);

  // Initialize core services
  const storage = useMemo(() => new TokenStorage(config.storageStrategy), [config.storageStrategy]);
  const client = useMemo(() => new AuthClient(config, storage), [config, storage]);
  
  // Initialize hook manager
  const hookManager = useMemo(() => {
    const manager = new HookManager({ config, storage, client });
    
    // Register user-provided hooks
    Object.entries(userHooks).forEach(([hookName, handler]) => {
      if (handler) {
        manager.register(hookName as any, handler);
      }
    });
    
    return manager;
  }, [config, storage, client, userHooks]);

  // State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const hasCheckedAuth = useRef(false);
  const pendingTokens = useRef<{ access_token: string; refresh_token: string } | null>(null);

  /**
   * Refresh access token
   */
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    if (isRefreshingToken) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return isAuthenticated;
    }

    setIsRefreshingToken(true);
    
    try {
      await hookManager.trigger('beforeTokenRefresh', {});
      
      const success = await client.refreshToken();
      
      await hookManager.trigger('afterTokenRefresh', { success });
      
      setIsAuthenticated(success);
      return success;
    } catch (error: any) {
      await hookManager.trigger('onTokenRefreshError', { error });
      return false;
    } finally {
      setIsRefreshingToken(false);
    }
  }, [client, hookManager, isRefreshingToken, isAuthenticated]);

  /**
   * Fetch user data
   */
  const fetchUserData = useCallback(async (): Promise<void> => {
    try {
      const hasLocalStorageTokens = await storage.shouldUseLocalStorage();
      const hasPendingTokens = pendingTokens.current !== null;

      const userData = await client.getUser();
      
      // Transform user if hook is registered
      const transformedUser = await hookManager.trigger('transformUser', { user: userData });
      const finalUser = transformedUser.user || userData;
      
      setUser(finalUser);

      // Clear pending tokens on success
      if (hasPendingTokens) {
        console.log('[AuthProvider] Cookies work! Discarding pending tokens');
        pendingTokens.current = null;
        await storage.clearTokens();
      } else if (!hasLocalStorageTokens) {
        await storage.clearTokens();
      }
    } catch (error: any) {
      // Handle 401 - cookies might be blocked
      if (error.message?.includes('401') && pendingTokens.current) {
        console.log('[AuthProvider] Cookies blocked! Switching to localStorage mode');
        await storage.setTokens(pendingTokens.current.access_token, pendingTokens.current.refresh_token);
        pendingTokens.current = null;
        
        // Retry
        await fetchUserData();
        return;
      }

      // Handle token refresh for localStorage mode
      if (error.message?.includes('401') || error.message?.includes('422')) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          await fetchUserData();
          return;
        }
      }

      setUser(null);
    }
  }, [client, storage, hookManager, refreshAccessToken]);

  /**
   * Complete authentication (after login/signup/oauth)
   */
  const completeAuthentication = useCallback(async (tokens: { access_token: string; refresh_token: string }) => {
    pendingTokens.current = tokens;
    setIsAuthenticated(true);
    await fetchUserData();
  }, [fetchUserData]);

  /**
   * Check authentication status
   */
  const checkAuth = useCallback(async (): Promise<void> => {
    try {
      const usingLocalStorage = await storage.shouldUseLocalStorage();
      const hasPendingTokens = pendingTokens.current !== null;

      if (hasPendingTokens) {
        setLoading(false);
        return;
      }

      // Smart refresh: If localStorage mode and access token missing but refresh exists, try refresh first
      if (usingLocalStorage) {
        const accessToken = await storage.getAccessToken();
        const refreshToken = await storage.getRefreshToken();
        
        if (!accessToken && refreshToken) {
          console.log('[AuthProvider] Access token missing but refresh exists, attempting refresh...');
          const refreshed = await refreshAccessToken();
          if (!refreshed) {
            console.log('[AuthProvider] Refresh failed, logging out');
            setIsAuthenticated(false);
            setUser(null);
            await storage.clearTokens();
            setLoading(false);
            return;
          }
          console.log('[AuthProvider] Token refreshed successfully');
        }
      }

      const isAuth = await client.checkAuth();
      
      if (isAuth) {
        setIsAuthenticated(true);
        await fetchUserData();
      } else {
        // 401/422 - try refresh and retry
        console.log('[AuthProvider] checkAuth failed, attempting token refresh...');
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          console.log('[AuthProvider] Token refreshed, retrying checkAuth...');
          setIsAuthenticated(true);
          await fetchUserData();
        } else {
          console.log('[AuthProvider] Token refresh failed, logging out');
          setIsAuthenticated(false);
          setUser(null);
          await storage.clearTokens();
        }
      }
    } catch (error) {
      console.error('[AuthProvider] checkAuth error:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [client, storage, fetchUserData, refreshAccessToken]);

  /**
   * Extract OAuth tokens from URL
   */
  const extractOAuthTokensFromUrl = useCallback(async (): Promise<{ access_token: string; refresh_token: string } | null> => {
    if (typeof window === 'undefined') return null;

    try {
      const href = window.location.href;
      if (!href.includes('access_token=') && !href.includes('refresh_token=')) {
        return null;
      }

      const url = new URL(href);
      const accessToken = url.searchParams.get('access_token');
      const refreshToken = url.searchParams.get('refresh_token');

      if (accessToken && refreshToken) {
        // Clear old tokens
        await storage.clearTokens();
        pendingTokens.current = null;

        // Clean up URL
        url.searchParams.delete('access_token');
        url.searchParams.delete('refresh_token');
        window.history.replaceState({}, document.title, url.toString());

        return { access_token: accessToken, refresh_token: refreshToken };
      }

      return null;
    } catch (error) {
      console.error('[AuthProvider] Error extracting OAuth tokens:', error);
      return null;
    }
  }, [storage]);

  /**
   * Initialize auth on mount
   */
  useEffect(() => {
    if (hasCheckedAuth.current) return;
    hasCheckedAuth.current = true;

    (async () => {
      const oauthTokens = await extractOAuthTokensFromUrl();
      
      if (oauthTokens) {
        await completeAuthentication(oauthTokens);
        setLoading(false);
      } else {
        await checkAuth();
      }

      onReady?.();
    })();
  }, [extractOAuthTokensFromUrl, completeAuthentication, checkAuth, onReady]);

  /**
   * Login
   */
  const login = useCallback(async (email: string, password: string) => {
    try {
      await hookManager.trigger('beforeLogin', { email });
      
      await storage.clearTokens();
      pendingTokens.current = null;

      const response = await client.login(email, password);

      if (response.access_token && response.refresh_token) {
        await completeAuthentication({
          access_token: response.access_token,
          refresh_token: response.refresh_token,
        });
      }

      await hookManager.trigger('afterLogin', { user: response.user!, tokens: response });

      return { success: true };
    } catch (error: any) {
      await hookManager.trigger('onLoginError', { email, error });
      setIsAuthenticated(false);
      return { success: false, error: error.message };
    }
  }, [client, storage, hookManager, completeAuthentication]);

  /**
   * Signup
   */
  const signup = useCallback(async (credentials: any) => {
    try {
      await hookManager.trigger('beforeSignup', credentials);
      
      await storage.clearTokens();
      pendingTokens.current = null;

      const response = await client.signup(credentials);

      if (response.access_token && response.refresh_token) {
        await completeAuthentication({
          access_token: response.access_token,
          refresh_token: response.refresh_token,
        });
      }

      await hookManager.trigger('afterSignup', { user: response.user!, tokens: response });

      return { success: true, message: response.message };
    } catch (error: any) {
      await hookManager.trigger('onSignupError', { email: credentials.email, error });
      setIsAuthenticated(false);
      return { success: false, error: error.message };
    }
  }, [client, storage, hookManager, completeAuthentication]);

  /**
   * Logout
   */
  const logout = useCallback(async () => {
    try {
      await hookManager.trigger('beforeLogout', {});
      
      await client.logout();
      
      setIsAuthenticated(false);
      setUser(null);
      await storage.clearTokens();
      pendingTokens.current = null;

      await hookManager.trigger('afterLogout', {});

      return { success: true };
    } catch (error: any) {
      await hookManager.trigger('onLogoutError', { error });
      
      // Clear local state even if server logout fails
      await storage.clearTokens();
      pendingTokens.current = null;
      
      return { success: false, error: error.message };
    }
  }, [client, storage, hookManager]);

  /**
   * Refresh user data
   */
  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const userData = await client.getUser();
      const transformedUser = await hookManager.trigger('transformUser', { user: userData });
      const finalUser = transformedUser.user || userData;
      setUser(finalUser);
      return finalUser;
    } catch (error) {
      console.error('[AuthProvider] refreshUser error:', error);
      return null;
    }
  }, [client, hookManager]);

  /**
   * Update user
   */
  const updateUser = useCallback(async (userData: Partial<User>) => {
    try {
      await hookManager.trigger('beforeUserUpdate', { data: userData });
      
      const updatedUser = await client.updateUser(userData);
      setUser(updatedUser);

      await hookManager.trigger('afterUserUpdate', { user: updatedUser });

      return { success: true, user: updatedUser };
    } catch (error: any) {
      await hookManager.trigger('onUserUpdateError', { error });
      return { success: false, error: error.message };
    }
  }, [client, hookManager]);

  /**
   * Update password
   */
  const updatePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    try {
      await hookManager.trigger('beforePasswordUpdate', {});
      
      await client.updatePassword(currentPassword, newPassword);

      await hookManager.trigger('afterPasswordUpdate', {});
    } catch (error: any) {
      await hookManager.trigger('onPasswordUpdateError', { error });
      throw error;
    }
  }, [client, hookManager]);

  /**
   * Google OAuth login
   */
  const googleLogin = useCallback((redirectPath?: string) => {
    const redirectUri = redirectPath 
      ? `${window.location.origin}?redirect=${encodeURIComponent(redirectPath)}`
      : window.location.origin;
    
    const url = client.getOAuthUrl('google', redirectUri);
    window.location.href = url;
  }, [client]);

  /**
   * Microsoft OAuth login
   */
  const microsoftLogin = useCallback((redirectPath?: string) => {
    const redirectUri = redirectPath
      ? `${window.location.origin}?redirect=${encodeURIComponent(redirectPath)}`
      : window.location.origin;
    
    const url = client.getOAuthUrl('microsoft', redirectUri);
    window.location.href = url;
  }, [client]);

  const contextValue = {
    isAuthenticated,
    loading,
    isRefreshingToken,
    user,
    login,
    signup,
    logout,
    refreshUser,
    refreshAccessToken,
    updateUser,
    updatePassword,
    googleLogin,
    microsoftLogin,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
