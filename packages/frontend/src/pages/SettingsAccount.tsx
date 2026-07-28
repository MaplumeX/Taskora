import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useCurrentUser } from '@/lib/hooks/useAuth';
import { useUpdateProfile, useUpdatePassword } from '@/lib/hooks/useUsers';

const TIMEZONES = Intl.supportedValuesOf('timeZone') as string[];
const LOCALES = ['zh', 'en'] as const;

export default function SettingsAccount() {
  const { t } = useTranslation(['auth', 'common']);
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const updatePassword = useUpdatePassword();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [timezone, setTimezone] = useState('');
  const [locale, setLocale] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Populate form when user data arrives
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '');
      setAvatarUrl(user.avatarUrl ?? '');
      setTimezone(user.timezone ?? '');
      setLocale(user.locale ?? '');
    }
  }, [user]);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(
      {
        displayName: displayName || null,
        avatarUrl: avatarUrl || null,
        timezone: timezone || null,
        locale: (locale || null) as 'zh' | 'en' | null,
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

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {t('auth:accountSettings')}
      </h1>

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

        <div className="flex flex-col gap-2">
          <Label htmlFor="timezone">{t('auth:timezone')}</Label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t('common:none')}</option>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="locale">{t('auth:locale')}</Label>
          <select
            id="locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t('common:none')}</option>
            {LOCALES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
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
    </div>
  );
}
