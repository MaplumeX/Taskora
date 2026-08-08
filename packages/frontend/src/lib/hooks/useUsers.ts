import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  updateProfile,
  updatePassword,
  updatePreferences,
  deleteAccount,
  exportData,
} from '@/lib/api/users.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { authKeys } from '@/lib/hooks/useAuth';
import type {
  UpdateProfileDto,
  UpdatePasswordDto,
  UpdatePreferencesDto,
  DeleteAccountDto,
} from '@taskora/shared';

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
        preferences: user.preferences,
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

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdatePreferencesDto) => updatePreferences(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: (data: DeleteAccountDto) => deleteAccount(data),
  });
}

export function useExportData() {
  return useMutation({
    mutationFn: () => exportData(),
  });
}
