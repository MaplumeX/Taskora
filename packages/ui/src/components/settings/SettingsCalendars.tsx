import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { Check } from 'lucide-react';

import { CALENDAR_COLORS, type CalendarColor, type CalendarSubscriptionDto } from '@taskora/shared';
import {
  i18n,
  useCalendarSubscriptions,
  useCreateCalendarSubscription,
  useDeleteCalendarSubscription,
  useUpdateCalendarSubscription,
} from '@taskora/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { CALENDAR_COLOR_CLASS } from '../calendar/calendarColors';
import {
  SettingsGroup,
  SettingsInputRow,
  SettingsOptionGroup,
  SettingsPage,
  SettingsRow,
  useSettingsNav,
} from './SettingsList';

/** 拉取失败的错误码（`http_error:404` 带状态码）→ 文案。 */
function fetchErrorText(code: string, t: TFunction): string {
  const [kind, status] = code.split(':');
  return t(`calendar:error_${kind}`, { status, defaultValue: t('calendar:error_unreachable') });
}

function requestErrorCode(error: unknown): string {
  const message = (error as { response?: { data?: { message?: unknown } } }).response?.data
    ?.message;
  return typeof message === 'string' ? message : 'unreachable';
}

function statusText(subscription: CalendarSubscriptionDto, t: TFunction): string | null {
  if (subscription.lastError) return fetchErrorText(subscription.lastError, t);
  if (!subscription.lastFetchedAt) return null;
  const time = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(subscription.lastFetchedAt));
  return t('calendar:lastFetched', { time });
}

function ColorDot({ color, className }: { color: CalendarColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-3 w-3 shrink-0 rounded-full',
        CALENDAR_COLOR_CLASS[color].bar,
        className,
      )}
    />
  );
}

function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: CalendarColor;
  onChange: (color: CalendarColor) => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {CALENDAR_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={t(`calendar:color_${color}`)}
          onClick={() => onChange(color)}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full text-white transition-transform hover:scale-110',
            CALENDAR_COLOR_CLASS[color].bar,
          )}
        >
          {value === color && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

/**
 * 日历订阅（ADR 0023）：粘贴 ICS 链接添加，按订阅改颜色、停用、移除。
 * 日程只读显示在 Today / Upcoming / Calendar。
 */
export default function SettingsCalendars() {
  const { t } = useTranslation(['calendar', 'common']);
  const { data: subscriptions = [], isLoading } = useCalendarSubscriptions();
  const create = useCreateCalendarSubscription();
  const update = useUpdateCalendarSubscription();
  const remove = useDeleteCalendarSubscription();
  const mobileNav = useSettingsNav();

  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const handleAdd = (e?: FormEvent) => {
    e?.preventDefault();
    if (!url.trim() || create.isPending) return;
    setAddError(null);
    create.mutate(
      { url: url.trim(), ...(name.trim() ? { name: name.trim() } : {}) },
      {
        onSuccess: (subscription) => {
          setUrl('');
          setName('');
          toast.success(t('calendar:subscriptionAdded', { name: subscription.name }));
        },
        onError: (error) => setAddError(fetchErrorText(requestErrorCode(error), t)),
      },
    );
  };

  const setEnabled = (subscription: CalendarSubscriptionDto, enabled: boolean) =>
    update.mutate(
      { id: subscription.id, data: { enabled } },
      { onError: () => toast.error(t('common:operationFailed')) },
    );
  const setColor = (subscription: CalendarSubscriptionDto, color: CalendarColor) =>
    update.mutate(
      { id: subscription.id, data: { color } },
      { onError: () => toast.error(t('common:operationFailed')) },
    );
  const handleRemove = (subscription: CalendarSubscriptionDto) =>
    remove.mutate(subscription.id, { onError: () => toast.error(t('common:operationFailed')) });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
      </div>
    );
  }

  if (mobileNav) {
    return (
      <SettingsPage>
        <form onSubmit={handleAdd}>
          <SettingsGroup
            header={t('calendar:subscriptions')}
            footer={
              addError ? (
                <span className="text-destructive">{addError}</span>
              ) : (
                t('calendar:subscriptionsHint')
              )
            }
          >
            <SettingsInputRow
              id="calendar-url"
              label={t('calendar:subscriptionUrl')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('calendar:subscriptionUrlPlaceholder')}
              inputMode="url"
              autoCapitalize="off"
              autoComplete="off"
              required
            />
            <SettingsInputRow
              id="calendar-name"
              label={t('calendar:subscriptionName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('calendar:subscriptionNamePlaceholder')}
            />
            <SettingsRow
              action
              submit
              disabled={create.isPending || !url.trim()}
              label={
                create.isPending ? t('calendar:addingSubscription') : t('calendar:addSubscription')
              }
            />
          </SettingsGroup>
        </form>

        {subscriptions.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">{t('calendar:noSubscriptions')}</p>
        ) : (
          subscriptions.map((subscription) => (
            <SettingsGroup key={subscription.id}>
              <SettingsRow
                leading={<ColorDot color={subscription.color} />}
                label={subscription.name}
                description={
                  <span className={cn(subscription.lastError && 'text-destructive')}>
                    {statusText(subscription, t) ?? subscription.url}
                  </span>
                }
                htmlFor={`calendar-enabled-${subscription.id}`}
                control={
                  <Switch
                    id={`calendar-enabled-${subscription.id}`}
                    aria-label={t('calendar:subscriptionEnabled')}
                    checked={subscription.enabled}
                    onCheckedChange={(checked) => setEnabled(subscription, checked)}
                  />
                }
              />
              <SettingsRow
                label={t('calendar:subscriptionColor')}
                value={t(`calendar:color_${subscription.color}`)}
                onClick={() =>
                  mobileNav.push({
                    title: t('calendar:subscriptionColor'),
                    render: () => (
                      <SettingsOptionGroup
                        options={CALENDAR_COLORS.map((color) => ({
                          value: color,
                          label: (
                            <span className="flex items-center gap-3">
                              <ColorDot color={color} />
                              {t(`calendar:color_${color}`)}
                            </span>
                          ),
                        }))}
                        value={subscription.color}
                        onChange={(color) => {
                          setColor(subscription, color);
                          mobileNav.pop();
                        }}
                      />
                    ),
                  })
                }
              />
              <SettingsRow
                destructive
                label={t('calendar:removeSubscription')}
                onClick={() => handleRemove(subscription)}
              />
            </SettingsGroup>
          ))
        )}
      </SettingsPage>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-1.5">
        <h2 className="text-title-2">{t('calendar:subscriptions')}</h2>
        <p className="text-sm text-muted-foreground">{t('calendar:subscriptionsHint')}</p>
      </section>

      <form onSubmit={handleAdd} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="calendar-url">{t('calendar:subscriptionUrl')}</Label>
          <Input
            id="calendar-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('calendar:subscriptionUrlPlaceholder')}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar-name">{t('calendar:subscriptionName')}</Label>
          <Input
            id="calendar-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('calendar:subscriptionNamePlaceholder')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={create.isPending || !url.trim()}>
            {create.isPending ? t('calendar:addingSubscription') : t('calendar:addSubscription')}
          </Button>
          {addError && <span className="text-sm text-destructive">{addError}</span>}
        </div>
      </form>

      <section className="space-y-2">
        {subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('calendar:noSubscriptions')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {subscriptions.map((subscription) => {
              const status = statusText(subscription, t);
              return (
                <li
                  key={subscription.id}
                  data-calendar-subscription={subscription.id}
                  className="flex flex-col gap-2 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <ColorDot color={subscription.color} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-medium">{subscription.name}</span>
                      <span className="truncate text-meta text-muted-foreground">
                        {subscription.url}
                      </span>
                    </div>
                    <Switch
                      aria-label={t('calendar:subscriptionEnabled')}
                      checked={subscription.enabled}
                      onCheckedChange={(checked) => setEnabled(subscription, checked)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pl-6">
                    <ColorPicker
                      label={t('calendar:subscriptionColor')}
                      value={subscription.color}
                      onChange={(color) => setColor(subscription, color)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemove(subscription)}
                    >
                      {t('calendar:removeSubscription')}
                    </Button>
                  </div>
                  {status && (
                    <p
                      className={cn(
                        'pl-6 text-meta',
                        subscription.lastError ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {status}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
