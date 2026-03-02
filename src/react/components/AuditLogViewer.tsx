/**
 * AuditLogViewer - Component for viewing audit logs and activity history
 * 
 * Displays authentication and activity logs for compliance and security monitoring.
 * 
 * Supabase parity: auth.audit_log_entries viewer
 * 
 * @example
 * ```tsx
 * <AuditLogViewer 
 *   type="audit"
 *   limit={50}
 * />
 * ```
 */

import React, { useEffect, useState } from 'react';
import { useAuditLogs } from '../hooks/useAuditLogs';

export interface AuditLogViewerProps {
  /** Type of logs to display */
  type: 'audit' | 'activity';
  /** Filter by action type */
  action?: string;
  /** Number of logs to display */
  limit?: number;
  /** Custom rendering for log item */
  renderLog?: (log: any) => React.ReactNode;
  /** Show loading state */
  showLoading?: boolean;
}

export function AuditLogViewer({
  type,
  action,
  limit = 50,
  renderLog,
  showLoading = true,
}: AuditLogViewerProps): React.ReactElement {
  const {
    auditLogs,
    activityLogs,
    loading,
    error,
    fetchAuditLogs,
    fetchActivityLogs,
  } = useAuditLogs();
  
  useEffect(() => {
    if (type === 'audit') {
      fetchAuditLogs({ action, limit });
    } else {
      fetchActivityLogs({ limit });
    }
  }, [type, action, limit]);
  
  const logs = type === 'audit' ? auditLogs : activityLogs;
  
  // Loading state
  if (loading && showLoading) {
    return <div className="audit-log-loading">Loading logs...</div>;
  }
  
  // Error state
  if (error) {
    return <div className="audit-log-error">Error: {error}</div>;
  }
  
  // No logs
  if (logs.length === 0) {
    return <div className="audit-log-empty">No logs found</div>;
  }
  
  return (
    <div className="audit-log-viewer">
      <div className="audit-log-header">
        <h3>{type === 'audit' ? 'Authentication Logs' : 'Activity Logs'}</h3>
        <span className="audit-log-count">{logs.length} entries</span>
      </div>
      
      <div className="audit-log-list">
        {logs.map((log) => (
          <div key={log.id} className="audit-log-item">
            {renderLog ? (
              renderLog(log)
            ) : (
              <DefaultLogItem log={log} type={type} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DefaultLogItem({
  log,
  type,
}: {
  log: any;
  type: 'audit' | 'activity';
}) {
  return (
    <div className="audit-log-item-default">
      <div className="log-header">
        <span className="log-action">{log.action}</span>
        {type === 'audit' && log.success !== undefined && (
          <span className={`log-status ${log.success ? 'success' : 'failed'}`}>
            {log.success ? 'Success' : 'Failed'}
          </span>
        )}
        {type === 'activity' && log.phi_accessed && (
          <span className="log-phi-badge">PHI</span>
        )}
      </div>
      
      <div className="log-details">
        <span className="log-timestamp">
          {new Date(log.timestamp).toLocaleString()}
        </span>
        {log.ip_address && (
          <span className="log-ip">IP: {log.ip_address}</span>
        )}
      </div>
      
      {log.resource_type && log.resource_id && (
        <div className="log-resource">
          {log.resource_type} ID: {log.resource_id}
        </div>
      )}
      
      {log.error_message && (
        <div className="log-error">{log.error_message}</div>
      )}
    </div>
  );
}

export default AuditLogViewer;
