/**
 * useSession - Hook for session management
 */

import { useAuth } from './useAuth';

export function useSession() {
  const { isAuthenticated, loading, isRefreshingToken, refreshAccessToken, checkAuth } = useAuth();
  
  return {
    isAuthenticated,
    loading,
    isRefreshingToken,
    refreshToken: refreshAccessToken,
    checkAuth,
  };
}

export default useSession;
