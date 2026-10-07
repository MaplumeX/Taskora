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
import { useCurrentUser } from '@taskora/api';
import { useUpdateProfile, useUpdatePassword, useDeleteAccount } from '@taskora/api';
import { useAuthStore, useLogout, useUiInteractionStore, withSessionLock } from '@taskora/api';

import {
  SettingsGroup,
  SettingsInputRow,
  SettingsPage,
  SettingsRow,
  useSettingsNav,
} from './SettingsList';

export default function SettingsAccount() {
  const { t } = useTranslation(['auth', 'common', 'settings']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const updatePassword = useUpdatePassword();
  const deleteAccount = useDeleteAccount();
  const logout = useLogout();
  const closeSettings = useUiInteractionStore((s) => s.closeSettings);
  const mobileNav = useSettingsNav();

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
          void withSessionLock(() => useAuthStore.getState().clear())
            .then(() => {
              queryClient.clear();
              navigate('/login');
              toast.success(t('settings:deleteAccountSuccess'));
            })
            .catch((error: Error) => toast.error(error.message));
        },
        onError: () => toast.error(t('settings:deleteAccountFailed')),
      },
    );
  };

  const openDeleteDialog = () => {
    setDeletePassword('');
    setDeleteDialogOpen(true);
  };

  const deleteDialog = (
    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings:deleteAccountConfirm')}</DialogTitle>
          <DialogDescription>{t('settings:deleteAccountConfirmDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="deletePassword">{t('settings:deleteAccountPasswordLabel')}</Label>
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
  );

  if (mobileNav) {
    // 窄屏：分组单元格；登出与删除账号为底部红字行
    return (
      <SettingsPage>
        <form onSubmit={handleProfileSubmit}>
          <SettingsGroup header={t('auth:profile')}>
            <SettingsInputRow
              id="displayName"
              label={t('auth:displayName')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={user?.email}
            />
            <SettingsInputRow
              id="avatarUrl"
              type="url"
              label={t('auth:avatarUrl')}
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
            />
            <SettingsRow
              submit
              action
              disabled={updateProfile.isPending}
              label={updateProfile.isPending ? t('common:save') + '…' : t('common:save')}
            />
          </SettingsGroup>
        </form>

        <form onSubmit={handlePasswordSubmit}>
          <SettingsGroup header={t('auth:changePassword')}>
            <SettingsInputRow
              id="currentPassword"
              type="password"
              label={t('auth:currentPassword')}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <SettingsInputRow
              id="newPassword"
              type="password"
              label={t('auth:newPassword')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <SettingsInputRow
              id="confirmPassword"
              type="password"
              label={t('auth:confirmPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <SettingsRow
              submit
              action
              disabled={updatePassword.isPending}
              label={updatePassword.isPending ? t('common:save') + '…' : t('common:save')}
            />
          </SettingsGroup>
        </form>

        <SettingsGroup>
          <SettingsRow
            destructive
            label={t('common:logout')}
            onClick={() => {
              closeSettings();
              void logout().then(() => navigate('/login', { replace: true }));
            }}
          />
        </SettingsGroup>

        <SettingsGroup footer={t('settings:deleteAccountDescription')}>
          <SettingsRow destructive label={t('settings:deleteAccount')} onClick={openDeleteDialog} />
        </SettingsGroup>

        {deleteDialog}
      </SettingsPage>
    );
  }

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

      {/* 账号删除区 */}
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-destructive">{t('settings:deleteAccount')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings:deleteAccountDescription')}</p>
        <Button variant="destructive" className="w-fit" onClick={openDeleteDialog}>
          {t('settings:deleteAccount')}
        </Button>
      </div>

      {deleteDialog}
    </div>
  );
}
