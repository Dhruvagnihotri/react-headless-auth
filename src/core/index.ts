/**
 * Core exports - Framework-agnostic authentication logic
 * Can be used in any JavaScript environment
 */

export { AuthClient } from './AuthClient';
export { RBACClient } from './RBACClient';
export { AdminClient } from './AdminClient';
export { TokenStorage, LocalStorageAdapter } from './TokenStorage';
export * from './types';
