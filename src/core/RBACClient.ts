/**
 * RBACClient - API client for RBAC management operations.
 * 
 * Communicates with the flask-headless-auth RBAC API endpoints.
 * Used for admin operations: managing roles, permissions, and user assignments.
 * 
 * @example
 * ```ts
 * const rbac = new RBACClient(authClient, '/api/rbac');
 * 
 * // List roles
 * const { roles } = await rbac.listRoles();
 * 
 * // Create a role
 * const { role } = await rbac.createRole({
 *   name: 'provider',
 *   description: 'Dental provider',
 *   permission_ids: [1, 2, 3]
 * });
 * ```
 */

import type {
  Role,
  Permission,
  CreateRoleInput,
  UpdateRoleInput,
  CreatePermissionInput,
} from './types';

export interface RBACClientConfig {
  apiBaseUrl: string;
  rbacPrefix: string;
  debug?: boolean;
}

export class RBACClient {
  private config: RBACClientConfig;
  private getHeaders: () => Promise<Record<string, string>>;

  constructor(
    config: RBACClientConfig,
    getHeaders: () => Promise<Record<string, string>>
  ) {
    this.config = config;
    this.getHeaders = getHeaders;
  }

  private getUrl(endpoint: string): string {
    return `${this.config.apiBaseUrl}${this.config.rbacPrefix}${endpoint}`;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = this.getUrl(endpoint);
    const headers = await this.getHeaders();

    if (this.config.debug) {
      console.log('[RBACClient] Request:', url, options.method || 'GET');
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
      throw new Error(errorData.error || errorData.message || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  // ---- Roles ----

  async listRoles(includePermissions = false): Promise<{ roles: Role[] }> {
    const params = includePermissions ? '?include_permissions=true' : '';
    return this.request(`/roles${params}`);
  }

  async getRole(roleId: number): Promise<{ role: Role }> {
    return this.request(`/roles/${roleId}`);
  }

  async createRole(data: CreateRoleInput): Promise<{ message: string; role: Role }> {
    return this.request('/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRole(roleId: number, data: UpdateRoleInput): Promise<{ message: string; role: Role }> {
    return this.request(`/roles/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteRole(roleId: number, force = false): Promise<{ message: string }> {
    const params = force ? '?force=true' : '';
    return this.request(`/roles/${roleId}${params}`, {
      method: 'DELETE',
    });
  }

  async cloneRole(roleId: number, newName: string, description?: string): Promise<{ message: string; role: Role }> {
    return this.request(`/roles/${roleId}/clone`, {
      method: 'POST',
      body: JSON.stringify({ name: newName, description }),
    });
  }

  // ---- Role Permissions ----

  async getRolePermissions(roleId: number): Promise<{ permissions: Permission[] }> {
    return this.request(`/roles/${roleId}/permissions`);
  }

  async syncRolePermissions(roleId: number, permissionIds: number[]): Promise<{ message: string; role: Role }> {
    return this.request(`/roles/${roleId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permission_ids: permissionIds }),
    });
  }

  async addRolePermissions(roleId: number, permissionIds: number[]): Promise<{ message: string; role: Role }> {
    return this.request(`/roles/${roleId}/permissions`, {
      method: 'POST',
      body: JSON.stringify({ permission_ids: permissionIds }),
    });
  }

  async removeRolePermissions(roleId: number, permissionIds: number[]): Promise<{ message: string; role: Role }> {
    return this.request(`/roles/${roleId}/permissions`, {
      method: 'DELETE',
      body: JSON.stringify({ permission_ids: permissionIds }),
    });
  }

  // ---- Permissions ----

  async listPermissions(filters?: { category?: string; resource?: string }): Promise<{ permissions: Permission[] }> {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.resource) params.set('resource', filters.resource);
    const query = params.toString();
    return this.request(`/permissions${query ? `?${query}` : ''}`);
  }

  async getPermission(permissionId: number): Promise<{ permission: Permission }> {
    return this.request(`/permissions/${permissionId}`);
  }

  async createPermission(data: CreatePermissionInput): Promise<{ message: string; permission: Permission }> {
    return this.request('/permissions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePermission(permissionId: number, data: Partial<CreatePermissionInput>): Promise<{ message: string; permission: Permission }> {
    return this.request(`/permissions/${permissionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePermission(permissionId: number, force = false): Promise<{ message: string }> {
    const params = force ? '?force=true' : '';
    return this.request(`/permissions/${permissionId}${params}`, {
      method: 'DELETE',
    });
  }

  async createPermissionsBulk(permissions: CreatePermissionInput[]): Promise<{ message: string; created: number; skipped: number }> {
    return this.request('/permissions/bulk', {
      method: 'POST',
      body: JSON.stringify({ permissions }),
    });
  }

  // ---- User Role Assignment ----

  async getUserRole(userId: number | string): Promise<{ role: Role | null; permissions: string[] }> {
    return this.request(`/users/${userId}/role`);
  }

  async assignRoleToUser(userId: number | string, roleId: number): Promise<{ message: string; user: any }> {
    return this.request(`/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role_id: roleId }),
    });
  }

  async revokeRoleFromUser(userId: number | string): Promise<{ message: string }> {
    return this.request(`/users/${userId}/role`, {
      method: 'DELETE',
    });
  }

  async listUsersByRole(roleId: number, page = 1, perPage = 20): Promise<{ users: any[]; total: number; page: number; pages: number }> {
    return this.request(`/users?role_id=${roleId}&page=${page}&per_page=${perPage}`);
  }

  // ---- Current User ----

  async getMyRole(): Promise<{ role: Role | null; permissions: string[] }> {
    return this.request('/me');
  }

  async getMyPermissions(): Promise<{ permissions: string[] }> {
    return this.request('/me/permissions');
  }

  async checkMyPermissions(permissions: string[]): Promise<{ results: Record<string, boolean> }> {
    return this.request('/me/check', {
      method: 'POST',
      body: JSON.stringify({ permissions }),
    });
  }

  // ---- Import/Export ----

  async exportConfig(): Promise<{ roles: Role[]; permissions: Permission[] }> {
    return this.request('/export');
  }

  async importConfig(data: { roles?: any[]; permissions?: any[] }): Promise<{ message: string; permissions_created: number; roles_created: number }> {
    return this.request('/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export default RBACClient;
