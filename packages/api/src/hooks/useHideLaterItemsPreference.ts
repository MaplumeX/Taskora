import { useCallback } from 'react';

import { updatePreferences } from '@/api/users.api';
import { hydrateFromServer, usePreferencesStore } from '@/stores/preferences.store';

/** 账号偏好里按弹窗记住的 Hide Later Items（目前只有 Move 选择器）。 */
export type HideLaterItemsPreference = 'hideLaterItemsInMovePicker';

/**
 * Move 选择器的隐藏稍后项开关：本地乐观更新 + 写回账号偏好，
 * 失败回滚（同 Grouped View 开关的惯例）。弹窗里随处可用，不依赖 QueryClient。
 */
export function useHideLaterItemsPreference(key: HideLaterItemsPreference): {
  hidden: boolean;
  toggle: () => void;
} {
  const hidden = usePreferencesStore((state) => state[key]);
  const toggle = useCallback(() => {
    const prev = usePreferencesStore.getState()[key];
    usePreferencesStore.getState().setHideLaterItems({ [key]: !prev });
    updatePreferences({ [key]: !prev }).then(
      (user) => hydrateFromServer(user.preferences),
      () => usePreferencesStore.getState().setHideLaterItems({ [key]: prev }),
    );
  }, [key]);
  return { hidden, toggle };
}
