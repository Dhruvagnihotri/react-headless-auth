/**
 * useAuditLogs - Hook for accessing audit logs and activity history
 * 
 * Provides Supabase parity for audit logging:
 * - View user's authentication history
 * - View activity logs
 * - View resource access history (HIPAA compliance)
 * 
 * @example
 * ```tsx
 * const { auditLogs, fetchAuditLogs } = useAuditLogs();
 * 
 * useEffect(() => {
 *   fetchAuditLogs({ action: 'user.login', limit: 50 });
 * }, []);
 * ```
 */

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface AuditLog {
  id: number;
  timestamp: string;
  action: string;
  actor_user_id?: number;
  target_user_id?: number;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  success: boolean;
  error_message?: string;
  metadata?: Record<string, any>;
}

export interface ActivityLog {
  id: number;
  timestamp: string;
  action: string;
  user_id: number;
  resource_type?: string;
  resource_id?: number;
  ip_address?: string;
  phi_accessed: boolean;
  metadata?: Record<string, any>;
}

export interface FetchLogsOptions {
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface UseAuditLogsConfig {
  /** Base URL for the audit API */
  auditBaseUrl?: string;
}

export interface UseAuditLogsReturn {
  /** Audit logs (authentication events) */
  auditLogs: AuditLog[];
  /** Activity logs (application events) */
  activityLogs: ActivityLog[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: string | null;
  /** Fetch audit logs */
  fetchAuditLogs: (options?: FetchLogsOptions) => Promise<void>;
  /** Fetch activity logs */
  fetchActivityLogs: (options?: FetchLogsOptions) => Promise<void>;
  /** Fetch resource access history (HIPAA) */
  fetchResourceHistory: (resourceType: string, resourceId: number) => Promise<ActivityLog[]>;
}

export function useAuditLogs(config?: UseAuditLogsConfig): UseAuditLogsReturn {
  const authContext = useAuth();
  const { getAccessToken } = authContext;
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive from AuthProvider config if available
  const apiBase = authContext.config?.apiBaseUrl || '';
  const derivedAuditPrefix = authContext.config?.audit?.auditPrefix
    || authContext.config?.apiPrefix?.replace(/\/auth$/, '/audit')
    || '/api/audit';
  const auditUrl = config?.auditBaseUrl || `${apiBase}${derivedAuditPrefix}`;

  // Build headers helper
  const buildHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, [getAccessToken]);

  const fetchAuditLogs = useCallback(async (options: FetchLogsOptions = {}) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (options.action) params.set('action', options.action);
      if (options.startDate) params.set('start_date', options.startDate);
      if (options.endDate) params.set('end_date', options.endDate);
      if (options.limit) params.set('limit', options.limit.toString());
      if (options.offset) params.set('offset', options.offset.toString());

      const response = await fetch(
        `${auditUrl}/audit-logs/me?${params}`,
        {
          headers: await buildHeaders(),
          credentials: 'include',
        }
      );

      if (!response.ok) throw new Error('Failed to fetch audit logs');

      const data = await response.json();
      setAuditLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [auditUrl, buildHeaders]);

  const fetchActivityLogs = useCallback(async (options: FetchLogsOptions = {}) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (options.limit) params.set('limit', options.limit.toString());
      if (options.offset) params.set('offset', options.offset.toString());

      const response = await fetch(
        `${auditUrl}/activity-logs/me?${params}`,
        {
          headers: await buildHeaders(),
          credentials: 'include',
        }
      );

      if (!response.ok) throw new Error('Failed to fetch activity logs');

      const data = await response.json();
      setActivityLogs(data.activities || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  }, [auditUrl, buildHeaders]);

  const fetchResourceHistory = useCallback(async (
    resourceType: string,
    resourceId: number,
  ): Promise<ActivityLog[]> => {
    try {
      const response = await fetch(
        `${auditUrl}/activity-logs/resource/${resourceType}/${resourceId}`,
        {
          headers: await buildHeaders(),
          credentials: 'include',
        }
      );

      if (!response.ok) throw new Error('Failed to fetch resource history');

      const data = await response.json();
      return data.access_history || [];
    } catch (err: any) {
      setError(err.message || 'Failed to load resource history');
      throw err;
    }
  }, [auditUrl, buildHeaders]);

  return {
    auditLogs,
    activityLogs,
    loading,
    error,
    fetchAuditLogs,
    fetchActivityLogs,
    fetchResourceHistory,
  };
}

export default useAuditLogs;
