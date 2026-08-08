import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { useCurrentUser } from '@/lib/hooks/useAuth';
import { useUpdateProfile, useUpdatePassword, useDeleteAccount } from '@/lib/hooks/useUsers';
import { useAuthStore } from '@/lib/stores/auth.store';

export default function SettingsAccount() {
  const { t } = useTranslation(['auth', 'common', 'settings']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const updatePassword = useUpdatePassword();
  const deleteAccount = useDeleteAccount();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  // Populate form when user data arrives
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '');
      setAvatarUrl(user.avatarUrl ?? '');
    }
  }, [user]);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(
      {
        displayName: displayName || null,
        avatarUrl: avatarUrl || null,
      },
      {
        onSuccess: () => toast.success(t('auth:profileSaved')),
        onError: () => toast.error(t('common:saveFailed')),
      },
    );
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t('auth:passwordMismatch'));
      return;
    }
    updatePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          toast.success(t('auth:passwordSaved'));
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        },
        onError: () => toast.error(t('auth:passwordChangeFailed')),
      },
    );
  };

  const handleDeleteAccount = () => {
    deleteAccount.mutate(
      { password: deletePassword },
      {
        onSuccess: () => {
          useAuthStore.getState().clear();
          queryClient.clear();
          navigate('/login');
          toast.success(t('settings:deleteAccountSuccess'));
        },
        onError: () => toast.error(t('settings:deleteAccountFailed')),
      },
    );
  };

  return (
    <div className="flex flex-col">
      <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">{t('auth:profile')}</h2>

        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">{t('auth:displayName')}</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={user?.email}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="avatarUrl">{t('auth:avatarUrl')}</Label>
          <Input
            id="avatarUrl"
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>

        <Button type="submit" disabled={updateProfile.isPending} className="w-fit">
          {updateProfile.isPending ? t('common:save') + '…' : t('common:save')}
        </Button>
      </form>

      <Separator className="my-8" />

      <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">{t('auth:changePassword')}</h2>

        <div className="flex flex-col gap-2">
          <Label htmlFor="currentPassword">{t('auth:currentPassword')}</Label>
          <Input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="newPassword">{t('auth:newPassword')}</Label>
          <Input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmPassword">{t('auth:confirmPassword')}</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <Button type="submit" disabled={updatePassword.isPending} className="w-fit">
          {updatePassword.isPending ? t('common:save') + '…' : t('common:save')}
        </Button>
      </form>

      <Separator className="my-8" />

      {/* 账户删除区 */}
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-destructive">
          {t('settings:deleteAccount')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('settings:deleteAccountDescription')}
        </p>
        <Button
          variant="destructive"
          className="w-fit"
          onClick={() => {
            setDeletePassword('');
            setDeleteDialogOpen(true);
          }}
        >
          {t('settings:deleteAccount')}
        </Button>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings:deleteAccountConfirm')}</DialogTitle>
            <DialogDescription>
              {t('settings:deleteAccountConfirmDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="deletePassword">
              {t('settings:deleteAccountPasswordLabel')}
            </Label>
            <Input
              id="deletePassword"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t('common:cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deleteAccount.isPending || !deletePassword}
              onClick={handleDeleteAccount}
            >
              {t('settings:deleteAccountConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
