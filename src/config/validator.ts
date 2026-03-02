/**
 * Configuration validation
 */

import type { AuthConfig } from '../core/types';
import { DEFAULT_AUTH_CONFIG } from './defaults';

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validate and normalize configuration
 */
export function validateConfig(config: Partial<AuthConfig>): Required<AuthConfig> {
  // Validate required fields
  if (!config.apiBaseUrl) {
    throw new ConfigValidationError('apiBaseUrl is required');
  }

  // Validate OAuth config
  if (config.enableGoogle && !config.googleClientId) {
    console.warn('[AuthConfig] Google OAuth enabled but googleClientId not provided');
  }

  if (config.enableMicrosoft && !config.microsoftClientId) {
    console.warn('[AuthConfig] Microsoft OAuth enabled but microsoftClientId not provided');
  }

  // Validate PostHog config
  if (config.enablePostHog && !config.posthogApiKey) {
    console.warn('[AuthConfig] PostHog enabled but posthogApiKey not provided');
  }

  // Derive sibling prefixes from apiPrefix (e.g. /api/mrscribe/auth → /api/mrscribe/rbac)
  const apiPrefix = config.apiPrefix ?? DEFAULT_AUTH_CONFIG.apiPrefix!;
  const basePrefix = apiPrefix.replace(/\/auth$/, '');

  // Merge with defaults
  return {
    ...DEFAULT_AUTH_CONFIG,
    ...config,
    apiBaseUrl: config.apiBaseUrl,
    apiPrefix,
    storageStrategy: config.storageStrategy ?? DEFAULT_AUTH_CONFIG.storageStrategy!,
    tokenRefreshInterval: config.tokenRefreshInterval ?? DEFAULT_AUTH_CONFIG.tokenRefreshInterval!,
    enableGoogle: config.enableGoogle ?? DEFAULT_AUTH_CONFIG.enableGoogle!,
    enableMicrosoft: config.enableMicrosoft ?? DEFAULT_AUTH_CONFIG.enableMicrosoft!,
    googleClientId: config.googleClientId ?? '',
    microsoftClientId: config.microsoftClientId ?? '',
    enablePostHog: config.enablePostHog ?? DEFAULT_AUTH_CONFIG.enablePostHog!,
    posthogApiKey: config.posthogApiKey ?? '',
    rbac: config.rbac ?? { rbacPrefix: `${basePrefix}/rbac`, autoFetchPermissions: true, permissionCacheTTL: 300000 },
    admin: config.admin ?? { adminPrefix: `${basePrefix}/admin` },
    audit: config.audit ?? { auditPrefix: `${basePrefix}/audit` },
    customHeaders: config.customHeaders ?? DEFAULT_AUTH_CONFIG.customHeaders!,
    endpoints: config.endpoints ?? {},
    debug: config.debug ?? DEFAULT_AUTH_CONFIG.debug!,
    logLevel: config.logLevel ?? DEFAULT_AUTH_CONFIG.logLevel!,
  };
}
