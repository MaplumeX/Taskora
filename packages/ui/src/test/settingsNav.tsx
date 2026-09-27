import { useState, type ReactNode } from 'react';

import {
  SettingsNavProvider,
  type SettingsPageEntry,
} from '@/components/settings/SettingsList';

/**
 * 测试用窄屏设置导航栈：与 MobileSettings 同语义（栈内页保持挂载、仅显示
 * 顶层），让设置页渲染列表单元格形态并可推入选项页。
 */
export function MobileSettingsHarness({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<SettingsPageEntry[]>([]);
  const nav = {
    push: (entry: SettingsPageEntry) => setStack((s) => [...s, entry]),
    pop: () => setStack((s) => s.slice(0, -1)),
  };
  return (
    <SettingsNavProvider value={nav}>
      <div hidden={stack.length > 0}>{children}</div>
      {stack.map((entry, i) => (
        <div key={i} hidden={i !== stack.length - 1} data-testid={`settings-page-${entry.title}`}>
          {entry.render()}
        </div>
      ))}
    </SettingsNavProvider>
  );
}
