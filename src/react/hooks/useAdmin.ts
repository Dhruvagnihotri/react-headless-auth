/**
 * useAdmin - Hook for admin user-management operations
 *
 * Provides a React-friendly wrapper around the AdminClient for managing
 * users from an admin dashboard: listing, creating, banning, deleting, etc.
 *
 * @example
 * ```tsx
 * const {
 *   users, total, pages, loading, error,
 *   fetchUsers, getUser, createUser, deleteUser,
 *   banUser, unbanUser, getUserSessions, forceLogoutUser,
 * } = useAdmin();
 *
 * // Fetch first page
 * useEffect(() => { fetchUsers(); }, []);
 *
 * // Ban a user
 * await banUser(5, { reason: 'Policy violation' });
 * ```
 */

import { useState, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import {
  AdminClient,
  type AdminClientConfig,
  type AdminUser,
  type ListUsersParams,
  type GetUserResponse,
  type CreateUserInput,
  type BanUserInput,
  type AdminSession,
} from '../../core/AdminClient';

export interface UseAdminConfig {
  /** URL prefix for the admin API (default: '/api/admin') */
  adminPrefix?: string;
  /** Enable debug logging */
  debug?: boolean;
}

export interface UseAdminReturn {
  // --- State (from last fetchUsers call) ---
  users: AdminUser[];
  total: number;
  page: number;
  pages: number;
  loading: boolean;
  error: string | null;

  // --- User listing ---
  fetchUsers: (params?: ListUsersParams) => Promise<void>;

  // --- Single user ---
  getUser: (userId: number | string) => Promise<GetUserResponse>;

  // --- Create & delete ---
  createUser: (data: CreateUserInput) => Promise<AdminUser>;
  deleteUser: (userId: number | string, hard?: boolean) => Promise<void>;

  // --- Ban / unban ---
  banUser: (userId: number | string, data?: BanUserInput) => Promise<void>;
  unbanUser: (userId: number | string, reason?: string) => Promise<void>;

  // --- Sessions ---
  getUserSessions: (userId: number | string) => Promise<AdminSession[]>;
  forceLogoutUser: (userId: number | string) => Promise<void>;
}

export function useAdmin(config?: UseAdminConfig): UseAdminReturn {
  const authContext = useAuth();
  const { getAccessToken, isAuthenticated } = authContext;

  // State for user listing
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build headers (works with both cookie and token modes)
  const buildHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, [getAccessToken]);

  // Derive admin URL prefix from AuthProvider config
  const derivedAdminPrefix = authContext.config?.admin?.adminPrefix
    || authContext.config?.apiPrefix?.replace(/\/auth$/, '/admin')
    || '/api/admin';

  // Memoised client instance
  const client = useMemo(() => {
    const apiBaseUrl = authContext.config?.apiBaseUrl || '';
    const clientConfig: AdminClientConfig = {
      apiBaseUrl,
      adminPrefix: config?.adminPrefix || derivedAdminPrefix,
      debug: config?.debug,
    };
    return new AdminClient(clientConfig, buildHeaders);
  }, [authContext.config?.apiBaseUrl, config?.adminPrefix, derivedAdminPrefix, config?.debug, buildHeaders]);

  // ---- User listing ----

  const fetchUsers = useCallback(async (params?: ListUsersParams) => {
    if (!isAuthenticated) {
      setUsers([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await client.listUsers(params);
      setUsers(res.users);
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, client]);

  // ---- Single user ----

  const getUser = useCallback(async (userId: number | string): Promise<GetUserResponse> => {
    return client.getUser(userId);
  }, [client]);

  // ---- Create & delete ----

  const createUser = useCallback(async (data: CreateUserInput): Promise<AdminUser> => {
    const res = await client.createUser(data);
    return res.user;
  }, [client]);

  const deleteUser = useCallback(async (userId: number | string, hard = false): Promise<void> => {
    await client.deleteUser(userId, hard);
  }, [client]);

  // ---- Ban / unban ----

  const banUser = useCallback(async (userId: number | string, data?: BanUserInput): Promise<void> => {
    await client.banUser(userId, data);
  }, [client]);

  const unbanUser = useCallback(async (userId: number | string, reason?: string): Promise<void> => {
    await client.unbanUser(userId, reason);
  }, [client]);

  // ---- Sessions ----

  const getUserSessions = useCallback(async (userId: number | string): Promise<AdminSession[]> => {
    const res = await client.getUserSessions(userId);
    return res.sessions;
  }, [client]);

  const forceLogoutUser = useCallback(async (userId: number | string): Promise<void> => {
    await client.forceLogoutUser(userId);
  }, [client]);

  return {
    users,
    total,
    page,
    pages,
    loading,
    error,
    fetchUsers,
    getUser,
    createUser,
    deleteUser,
    banUser,
    unbanUser,
    getUserSessions,
    forceLogoutUser,
  };
}

export default useAdmin;
