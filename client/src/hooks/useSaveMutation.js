import { useMutation, useQueryClient } from '@tanstack/react-query';

// Every catalog page saves the same way: create or update, refresh the list, close the form.
export function useSaveMutation({ create, update, queryKey, onSaved }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => (id ? update(id, body) : create(body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      onSaved?.();
    },
  });
}

export function useDeleteMutation({ remove, queryKey }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
}
