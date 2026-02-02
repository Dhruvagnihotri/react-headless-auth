/**
 * Optional helper for making authenticated requests with automatic 401 retry
 * 
 * NOTE: All internal AuthClient methods (getUser, updateUser, etc.) now have
 * built-in automatic 401 handling. This helper is ONLY needed for your own
 * custom API endpoints outside the auth system.
 * 
 * IMPORTANT: This is a TRUE fetch proxy - it supports ALL fetch options:
 * - All HTTP methods (GET, POST, PUT, DELETE, PATCH, etc.)
 * - All headers (custom headers, content-type, etc.)
 * - Request body (JSON, FormData, Blob, etc.)
 * - AbortController signals
 * - Cache control, credentials, mode, redirect, referrer, etc.
 * - Literally EVERYTHING that native fetch supports
 * 
 * For example:
 * - /api/data (your app endpoints) - use this helper
 * - /api/auth/user/@me (auth endpoints) - already handled automatically
 * 
 * Alternative: You can use getAccessToken() and your own HTTP client:
 * ```typescript
 * const token = await getAccessToken();
 * await axios.get('/api/data', {
 *   headers: { Authorization: `Bearer ${token}` }
 * });
 * ```
 */

export interface FetchWithAuthOptions {
  getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
  refreshAccessToken?: () => Promise<boolean>;
  maxRetries?: number;
  debug?: boolean;
}

/**
 * Create a fetch wrapper that automatically handles 401 errors
 * Works for both cookie-first and localStorage modes
 * 
 * This is a TRUE fetch proxy - supports ALL fetch options:
 * - method, headers, body, signal, cache, credentials, mode, redirect, referrer, etc.
 * - Literally everything that native fetch supports
 * 
 * @example Basic usage
 * ```typescript
 * const { getAccessToken, refreshAccessToken } = useAuth();
 * const authFetch = createAuthFetch({ getAccessToken, refreshAccessToken });
 * 
 * // Simple GET
 * const response = await authFetch('/api/data');
 * const data = await response.json();
 * ```
 * 
 * @example Advanced usage with all fetch options
 * ```typescript
 * const authFetch = createAuthFetch({ getAccessToken });
 * 
 * const controller = new AbortController();
 * const response = await authFetch('/api/data', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'X-Custom-Header': 'value',
 *     'X-Another-Header': 'value',
 *   },
 *   body: JSON.stringify({ key: 'value' }),
 *   signal: controller.signal,
 *   cache: 'no-cache',
 *   credentials: 'include',
 *   mode: 'cors',
 *   redirect: 'follow',
 *   referrer: 'no-referrer',
 * });
 * ```
 * 
 * @example With FormData
 * ```typescript
 * const formData = new FormData();
 * formData.append('file', file);
 * 
 * const response = await authFetch('/api/upload', {
 *   method: 'POST',
 *   body: formData,
 *   // Note: Don't set Content-Type for FormData, browser sets it automatically
 * });
 * ```
 */
export function createAuthFetch(options: FetchWithAuthOptions) {
  const { getAccessToken, refreshAccessToken, maxRetries = 1, debug = false } = options;

  return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let retryCount = 0;

    const makeRequest = async (): Promise<Response> => {
      // Get token (null in cookie mode, string in localStorage mode)
      const token = await getAccessToken();

      if (debug) {
        console.log('[authFetch] Making request:', url, token ? 'with token' : 'cookie mode');
      }

      // Merge headers properly, preserving user's headers
      const headers = new Headers(init?.headers);
      
      // Add Authorization header if we have a token (localStorage mode)
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      // Make request with ALL user-provided options
      const response = await fetch(url, {
        ...init, // Spread ALL user options (method, body, signal, cache, etc.)
        headers, // Use merged headers
        credentials: init?.credentials ?? 'include', // Default to 'include' for cookies, but allow override
      });

      // If 401 and we haven't exceeded retries, refresh and try again
      if (response.status === 401 && retryCount < maxRetries) {
        retryCount++;

        if (debug) {
          console.log(`[authFetch] Got 401, attempting refresh (retry ${retryCount}/${maxRetries})`);
        }

        // Refresh token
        if (refreshAccessToken) {
          const refreshSuccess = await refreshAccessToken();
          
          if (!refreshSuccess) {
            if (debug) {
              console.warn('[authFetch] Token refresh failed');
            }
            return response;
          }
        } else {
          // No refresh function, just get fresh token
          await getAccessToken({ forceRefresh: true });
        }

        // Retry request
        return makeRequest();
      }

      return response;
    };

    return makeRequest();
  };
}

/**
 * React hook version for convenience
 * 
 * @example Basic usage
 * ```typescript
 * function MyComponent() {
 *   const authFetch = useAuthFetch();
 *   
 *   const fetchData = async () => {
 *     const response = await authFetch('/api/data');
 *     return response.json();
 *   };
 * }
 * ```
 * 
 * @example Advanced usage with all fetch options
 * ```typescript
 * function MyComponent() {
 *   const authFetch = useAuthFetch();
 *   
 *   const uploadFile = async (file: File) => {
 *     const formData = new FormData();
 *     formData.append('file', file);
 *     
 *     const response = await authFetch('/api/upload', {
 *       method: 'POST',
 *       body: formData,
 *       headers: {
 *         'X-Custom-Header': 'value',
 *       },
 *     });
 *     
 *     return response.json();
 *   };
 *   
 *   const postData = async (data: any) => {
 *     const controller = new AbortController();
 *     
 *     const response = await authFetch('/api/data', {
 *       method: 'POST',
 *       headers: {
 *         'Content-Type': 'application/json',
 *         'X-Request-ID': crypto.randomUUID(),
 *       },
 *       body: JSON.stringify(data),
 *       signal: controller.signal,
 *       cache: 'no-cache',
 *     });
 *     
 *     return response.json();
 *   };
 * }
 * ```
 */
export function useAuthFetch(authContext: { 
  getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
  refreshAccessToken: () => Promise<boolean>;
}) {
  return createAuthFetch({
    getAccessToken: authContext.getAccessToken,
    refreshAccessToken: authContext.refreshAccessToken,
  });
}
