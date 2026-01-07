/**
 * useUser - Hook for accessing user data
 */

import { useAuth } from './useAuth';

export function useUser() {
  const { user, refreshUser, updateUser } = useAuth();
  
  return {
    user,
    refreshUser,
    updateUser,
    isLoading: user === null,
  };
}

export default useUser;
