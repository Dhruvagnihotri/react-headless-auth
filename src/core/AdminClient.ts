/**
 * AdminClient - API client for admin user-management operations.
 *
 * Communicates with the flask-headless-auth Admin API endpoints
 * at /api/admin (configurable via `adminPrefix`).
 *
 * Provides Clerk / Supabase parity:
 * - List, get, create, delete users
 * - Ban / unban users
 * - View and revoke user sessions
 *
 * @example
 * ```ts
 * const admin = new AdminClient(config, getHeaders);
 *
 * // List all users
 * const { users, total } = await admin.listUsers();
 *
 * // Create a new staff member
 * const { user } = await admin.createUser({
 *   email: 'jane@clinic.com',
 *   password: 'securePass123',
 *   first_name: 'Jane',
 *   role_id: 3,
 * });
 *
 * // Ban a user
 * await admin.banUser(5, { reason: 'Policy violation' });
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminClientConfig {
  apiBaseUrl: string;
  adminPrefix: string;
  debug?: boolean;
}

/** Filters for listing users. */
export interface ListUsersParams {
  page?: number;
  per_page?: number;
  is_active?: boolean;
  role_id?: number;
  /** Partial email search */
  q?: string;
}

export interface ListUsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
}

export interface AdminUser {
  id: number;
  email: string;
  is_active: boolean;
  is_verified?: boolean;
  role_id?: number;
  first_name?: string;
  last_name?: string;
  created_at?: string;
  provider?: string;
}

export interface GetUserResponse {
  user: AdminUser;
  is_active: boolean;
  is_verified: boolean;
  active_sessions: number;
  last_login: string | null;
  ban_history: Record<string, any>[];
}

export interface CreateUserInput {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  role_id?: number;
  is_verified?: boolean;
  send_invite?: boolean;
}

export interface BanUserInput {
  reason?: string;
  duration_hours?: number;
}

export interface AdminSession {
  id: number;
  session_id: string;
  device_name: string;
  ip_address: string;
  country?: string;
  city?: string;
  created_at: string;
  last_activity: string;
  is_active: boolean;
  revoked: boolean;
  revoke_reason?: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AdminClient {
  private config: AdminClientConfig;
  private getHeaders: () => Promise<Record<string, string>>;

  constructor(
    config: AdminClientConfig,
    getHeaders: () => Promise<Record<string, string>>,
  ) {
    this.config = config;
    this.getHeaders = getHeaders;
  }

  private getUrl(endpoint: string): string {
    return `${this.config.apiBaseUrl}${this.config.adminPrefix}${endpoint}`;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = this.getUrl(endpoint);
    const headers = await this.getHeaders();

    if (this.config.debug) {
      console.log('[AdminClient] Request:', options.method || 'GET', url);
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(options.headers as Record<string, string> || {}),
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || errorData.message || `Request failed: ${response.status}`,
      );
    }

    return response.json();
  }

  // ==================================================================
  // USER LISTING & DETAILS
  // ==================================================================

  /** List users with pagination and optional filters. */
  async listUsers(params?: ListUsersParams): Promise<ListUsersResponse> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.per_page) qs.set('per_page', String(params.per_page));
    if (params?.is_active !== undefined) qs.set('is_active', String(params.is_active));
    if (params?.role_id) qs.set('role_id', String(params.role_id));
    if (params?.q) qs.set('q', params.q);
    const query = qs.toString();
    return this.request(`/users${query ? `?${query}` : ''}`);
  }

  /** Get a user's full profile + status (sessions, ban history). */
  async getUser(userId: number | string): Promise<GetUserResponse> {
    return this.request(`/users/${userId}`);
  }

  // ==================================================================
  // CREATE & DELETE
  // ==================================================================

  /** Create a new user (admin onboarding). */
  async createUser(data: CreateUserInput): Promise<{ message: string; user: AdminUser }> {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a user.
   * @param hard - If true, permanently removes the row.  Default is soft-delete.
   */
  async deleteUser(
    userId: number | string,
    hard = false,
  ): Promise<{ message: string; user_id: number; hard_delete: boolean; sessions_revoked: number }> {
    const params = hard ? '?hard=true' : '';
    return this.request(`/users/${userId}${params}`, {
      method: 'DELETE',
    });
  }

  // ==================================================================
  // BAN / UNBAN
  // ==================================================================

  /** Ban / deactivate a user.  Revokes all sessions immediately. */
  async banUser(
    userId: number | string,
    data?: BanUserInput,
  ): Promise<{ message: string; user_id: number; sessions_revoked: number; reason: string }> {
    return this.request(`/users/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  /** Unban / reactivate a user. */
  async unbanUser(
    userId: number | string,
    reason?: string,
  ): Promise<{ message: string; user_id: number }> {
    return this.request(`/users/${userId}/unban`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Unbanned by admin' }),
    });
  }

  // ==================================================================
  // ADMIN SESSION MANAGEMENT (per-user)
  // ==================================================================

  /** Get all sessions for a user (including revoked). */
  async getUserSessions(
    userId: number | string,
  ): Promise<{ user_id: number; sessions: AdminSession[]; count: number }> {
    return this.request(`/users/${userId}/sessions`);
  }

  /** Force-logout a user from all devices. */
  async forceLogoutUser(
    userId: number | string,
  ): Promise<{ message: string; user_id: number; sessions_revoked: number }> {
    return this.request(`/users/${userId}/sessions/revoke-all`, {
      method: 'POST',
    });
  }
}

export default AdminClient;
