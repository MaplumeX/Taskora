import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  updateProfile,
  updatePassword,
  updatePreferences,
  deleteAccount,
  exportData,
} from '@/api/users.api';
import { useAuthStore } from '@/stores/auth.store';
import { writeRefreshToken } from '@/token-store';
import { authKeys } from '@/hooks/useAuth';
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
  const setToken = useAuthStore((s) => s.setToken);
  return useMutation({
    mutationFn: (data: UpdatePasswordDto) => updatePassword(data),
    onSuccess: async (result) => {
      // The password change revoked every refresh token server-side and
      // issued a fresh one for this session (cookie on web, body on
      // desktop). Persist it before the current access token expires,
      // otherwise the next refresh uses the revoked token and signs out.
      if (result.refreshToken) {
        const token = useAuthStore.getState().token;
        if (token) {
          await setToken(token, result.refreshToken);
        } else {
          // Token-less edge (should not happen while signed in): at least
          // persist the refresh token so the next boot can recover.
          await writeRefreshToken(result.refreshToken);
        }
      }
    },
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
