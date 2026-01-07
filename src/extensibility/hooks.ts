/**
 * Extensibility Hooks System
 * Allows users to inject custom logic at lifecycle points
 */

import type { User, AuthConfig } from '../core/types';
import type { AuthClient } from '../core/AuthClient';
import type { TokenStorage } from '../core/TokenStorage';

export type AuthHook =
  | 'beforeLogin'
  | 'afterLogin'
  | 'onLoginError'
  | 'beforeSignup'
  | 'afterSignup'
  | 'onSignupError'
  | 'beforeLogout'
  | 'afterLogout'
  | 'onLogoutError'
  | 'beforeTokenRefresh'
  | 'afterTokenRefresh'
  | 'onTokenRefreshError'
  | 'beforePasswordUpdate'
  | 'afterPasswordUpdate'
  | 'onPasswordUpdateError'
  | 'beforeUserUpdate'
  | 'afterUserUpdate'
  | 'onUserUpdateError'
  | 'onAuthError'
  | 'transformUser';

export interface HookContext {
  config: AuthConfig;
  storage: TokenStorage;
  client: AuthClient;
}

export type HookHandler<T = any> = (
  data: T,
  context: HookContext
) => void | Promise<void> | T | Promise<T>;

export interface HookHandlers {
  beforeLogin?: HookHandler<{ email: string }>;
  afterLogin?: HookHandler<{ user: User; tokens?: any }>;
  onLoginError?: HookHandler<{ email: string; error: Error }>;
  beforeSignup?: HookHandler<{ email: string; [key: string]: any }>;
  afterSignup?: HookHandler<{ user: User; tokens?: any }>;
  onSignupError?: HookHandler<{ email: string; error: Error }>;
  beforeLogout?: HookHandler<{}>;
  afterLogout?: HookHandler<{}>;
  onLogoutError?: HookHandler<{ error: Error }>;
  beforeTokenRefresh?: HookHandler<{}>;
  afterTokenRefresh?: HookHandler<{ success: boolean }>;
  onTokenRefreshError?: HookHandler<{ error: Error }>;
  beforePasswordUpdate?: HookHandler<{}>;
  afterPasswordUpdate?: HookHandler<{}>;
  onPasswordUpdateError?: HookHandler<{ error: Error }>;
  beforeUserUpdate?: HookHandler<{ data: any }>;
  afterUserUpdate?: HookHandler<{ user: User }>;
  onUserUpdateError?: HookHandler<{ error: Error }>;
  onAuthError?: HookHandler<{ error: Error }>;
  transformUser?: HookHandler<{ user: User }>;
}

/**
 * Hook manager for handling lifecycle hooks
 */
export class HookManager {
  private hooks: Map<AuthHook, HookHandler[]> = new Map();
  private context: HookContext;

  constructor(context: HookContext) {
    this.context = context;
  }

  /**
   * Register a hook handler
   */
  register(hook: AuthHook, handler: HookHandler): void {
    if (!this.hooks.has(hook)) {
      this.hooks.set(hook, []);
    }
    this.hooks.get(hook)!.push(handler);
  }

  /**
   * Trigger a hook with data
   */
  async trigger<T>(hook: AuthHook, data: T): Promise<T> {
    const handlers = this.hooks.get(hook) || [];
    let result = data;

    for (const handler of handlers) {
      try {
        const handlerResult = await handler(result, this.context);
        // If handler returns a value (like transformUser), use it
        if (handlerResult !== undefined) {
          result = handlerResult;
        }
      } catch (error) {
        console.error(`[HookManager] Hook ${hook} failed:`, error);
        // Continue with other hooks even if one fails
      }
    }

    return result;
  }

  /**
   * Check if a hook has handlers
   */
  hasHandlers(hook: AuthHook): boolean {
    return (this.hooks.get(hook)?.length ?? 0) > 0;
  }

  /**
   * Clear all hooks
   */
  clear(): void {
    this.hooks.clear();
  }
}

export default HookManager;
