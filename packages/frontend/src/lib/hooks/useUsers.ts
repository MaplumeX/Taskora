import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateProfile, updatePassword } from '@/lib/api/users.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { authKeys } from '@/lib/hooks/useAuth';
import type { UpdateProfileDto, UpdatePasswordDto } from '@taskora/shared';

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (data: UpdateProfileDto) => updateProfile(data),
    onSuccess: (user) => {
      setUser({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });
      void queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: (data: UpdatePasswordDto) => updatePassword(data),
  });
}
