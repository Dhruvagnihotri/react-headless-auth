/**
 * useSessions - Hook for managing user sessions
 * 
 * Provides Supabase parity for session management:
 * - View active sessions (devices)
 * - Logout from specific devices
 * - Logout from all devices
 * 
 * @example
 * ```tsx
 * const { sessions, loading, revokeSession, revokeAllSessions } = useSessions();
 * 
 * return (
 *   <div>
 *     <h2>Active Sessions</h2>
 *     {sessions.map(session => (
 *       <div key={session.id}>
 *         <p>{session.device_name}</p>
 *         <p>{session.ip_address}</p>
 *         {!session.is_current && (
 *           <button onClick={() => revokeSession(session.session_id)}>
 *             Logout
 *           </button>
 *         )}
 *       </div>
 *     ))}
 *     <button onClick={revokeAllSessions}>
 *       Logout from all devices
 *     </button>
 *   </div>
 * );
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface Session {
  id: number;
  session_id: string;
  device_name: string;
  ip_address: string;
  country?: string;
  city?: string;
  created_at: string;
  last_activity: string;
  is_active: boolean;
  is_current: boolean;
}

export interface UseSessionsConfig {
  /** Base URL for the audit API (default: auto-detected from auth config) */
  auditBaseUrl?: string;
}

export interface UseSessionsReturn {
  /** List of active sessions */
  sessions: Session[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: string | null;
  /** Refresh sessions list */
  refresh: () => Promise<void>;
  /** Revoke a specific session */
  revokeSession: (sessionId: string) => Promise<void>;
  /** Revoke all sessions except current */
  revokeAllSessions: () => Promise<void>;
}

export function useSessions(config?: UseSessionsConfig): UseSessionsReturn {
  const authContext = useAuth();
  const { getAccessToken, isAuthenticated } = authContext;
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build headers helper (works with both cookie and token modes)
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

  // Determine audit URL prefix — derive from AuthProvider config if available
  const apiBase = authContext.config?.apiBaseUrl || '';
  const derivedAuditPrefix = authContext.config?.audit?.auditPrefix
    || authContext.config?.apiPrefix?.replace(/\/auth$/, '/audit')
    || '/api/audit';
  const auditUrl = config?.auditBaseUrl || `${apiBase}${derivedAuditPrefix}`;

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setSessions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${auditUrl}/sessions/me`, {
        headers: await buildHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }

      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, auditUrl, buildHeaders]);

  const revokeSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`${auditUrl}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: await buildHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to revoke session');
      }

      await refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke session');
      throw err;
    }
  }, [auditUrl, buildHeaders, refresh]);

  const revokeAllSessions = useCallback(async () => {
    try {
      const response = await fetch(`${auditUrl}/sessions/revoke-all`, {
        method: 'POST',
        headers: await buildHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to revoke sessions');
      }

      await refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke sessions');
      throw err;
    }
  }, [auditUrl, buildHeaders, refresh]);

  // Load sessions on mount + when auth changes
  useEffect(() => {
    if (isAuthenticated) {
      refresh();
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    sessions,
    loading,
    error,
    refresh,
    revokeSession,
    revokeAllSessions,
  };
}

export default useSessions;
