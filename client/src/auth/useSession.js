import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth.js';

const SESSION_KEY = ['session'];

export function useSession() {
  const { data: user, isLoading } = useQuery({
    queryKey: SESSION_KEY,
    // A 401 just means logged out, not an error worth retrying.
    queryFn: () => authApi.fetchCurrentUser().catch(() => null),
    staleTime: Infinity,
  });
  return { user: user ?? null, isLoading };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => queryClient.setQueryData(SESSION_KEY, data.user),
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.signup,
    onSuccess: (data) => queryClient.setQueryData(SESSION_KEY, data.user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_KEY, null);
    },
  });
}
