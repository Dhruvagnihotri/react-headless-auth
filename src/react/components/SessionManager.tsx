/**
 * SessionManager - Component for managing active sessions
 * 
 * Displays all active sessions (devices) and allows users to:
 * - See where they're logged in
 * - Logout from specific devices
 * - Logout from all devices
 * 
 * Supabase parity: auth.sessions management UI
 * 
 * @example
 * ```tsx
 * <SessionManager 
 *   onSessionRevoked={() => console.log('Session revoked')}
 * />
 * ```
 */

import React from 'react';
import { useSessions } from '../hooks/useSessions';

export interface SessionManagerProps {
  /** Callback when a session is revoked */
  onSessionRevoked?: () => void;
  /** Callback when all sessions are revoked */
  onAllSessionsRevoked?: () => void;
  /** Custom rendering for session item */
  renderSession?: (session: any, onRevoke: () => void) => React.ReactNode;
  /** Show loading state */
  showLoading?: boolean;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** Custom error component */
  errorComponent?: (error: string) => React.ReactNode;
}

export function SessionManager({
  onSessionRevoked,
  onAllSessionsRevoked,
  renderSession,
  showLoading = true,
  loadingComponent,
  errorComponent,
}: SessionManagerProps): React.ReactElement {
  const {
    sessions,
    loading,
    error,
    revokeSession,
    revokeAllSessions,
  } = useSessions();
  
  const handleRevokeSession = async (sessionId: string) => {
    try {
      await revokeSession(sessionId);
      onSessionRevoked?.();
    } catch (err) {
      console.error('Failed to revoke session:', err);
    }
  };
  
  const handleRevokeAll = async () => {
    try {
      await revokeAllSessions();
      onAllSessionsRevoked?.();
    } catch (err) {
      console.error('Failed to revoke all sessions:', err);
    }
  };
  
  // Loading state
  if (loading && showLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }
    return <div className="session-manager-loading">Loading sessions...</div>;
  }
  
  // Error state
  if (error) {
    if (errorComponent) {
      return <>{errorComponent(error)}</>;
    }
    return <div className="session-manager-error">Error: {error}</div>;
  }
  
  // No sessions
  if (sessions.length === 0) {
    return <div className="session-manager-empty">No active sessions</div>;
  }
  
  return (
    <div className="session-manager">
      <div className="session-manager-header">
        <h3>Active Sessions ({sessions.length})</h3>
        {sessions.length > 1 && (
          <button
            className="session-manager-revoke-all"
            onClick={handleRevokeAll}
          >
            Logout from all devices
          </button>
        )}
      </div>
      
      <div className="session-manager-list">
        {sessions.map((session) => (
          <div key={session.id} className="session-item">
            {renderSession ? (
              renderSession(session, () => handleRevokeSession(session.session_id))
            ) : (
              <DefaultSessionItem
                session={session}
                onRevoke={() => handleRevokeSession(session.session_id)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DefaultSessionItem({
  session,
  onRevoke,
}: {
  session: any;
  onRevoke: () => void;
}) {
  return (
    <div className="session-item-default">
      <div className="session-info">
        <div className="session-device">
          <strong>{session.device_name || 'Unknown Device'}</strong>
          {session.is_current && (
            <span className="session-current-badge">Current Session</span>
          )}
        </div>
        
        <div className="session-details">
          <span>IP: {session.ip_address || 'Unknown'}</span>
          {session.city && session.country && (
            <span>Location: {session.city}, {session.country}</span>
          )}
        </div>
        
        <div className="session-timestamps">
          <span>Created: {new Date(session.created_at).toLocaleString()}</span>
          <span>Last active: {new Date(session.last_activity).toLocaleString()}</span>
        </div>
      </div>
      
      {!session.is_current && (
        <button
          className="session-revoke-button"
          onClick={onRevoke}
        >
          Logout
        </button>
      )}
    </div>
  );
}

export default SessionManager;
