import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsModal } from './SettingsModal';
import { useUiInteractionStore } from '@taskora/api';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useAgentConfig: () => ({ data: undefined }),
}));

// 各设置页做网络/运行时请求，替换为占位组件，聚焦弹窗骨架的断点行为。
vi.mock('@/components/settings/SettingsGeneral', () => ({ default: () => <div>GeneralPage</div> }));
vi.mock('@/components/settings/SettingsAppearance', () => ({ default: () => <div>AppearancePage</div> }));
vi.mock('@/components/settings/SettingsAccount', () => ({ default: () => <div>AccountPage</div> }));
vi.mock('@/components/settings/SettingsData', () => ({ default: () => <div>DataPage</div> }));
vi.mock('@/components/settings/SettingsAbout', () => ({ default: () => <div>AboutPage</div> }));
vi.mock('@/components/settings/SettingsAssistant', () => ({ default: () => <div>AssistantPage</div> }));

/** 控制 matchMedia('(min-width: 768px)') 的返回值，驱动 useIsDesktop。 */
function setDesktop(desktop: boolean) {
  window.matchMedia = (query: string) => ({
    matches: desktop && query.includes('min-width'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
}

describe('SettingsModal — 桌面端', () => {
  beforeEach(() => {
    useUiInteractionStore.setState({ settingsOpen: true, settingsTab: 'general', settingsEntryTab: null });
  });

  it('渲染居中弹窗（含居中 transform）与当前分类', async () => {
    setDesktop(true);
    render(<SettingsModal />);

    expect(await screen.findByText('GeneralPage')).toBeTruthy();
    const fixedRoot = document.querySelector('[class*="translate-x"][class*="z-50"]');
    expect(fixedRoot?.className ?? '').toContain('translate-x-[-50%]');
  });
});

describe('SettingsModal — 移动端（分类首页 → 推入详情页）', () => {
  beforeEach(() => {
    setDesktop(false);
    useUiInteractionStore.setState({ settingsOpen: true, settingsTab: 'appearance', settingsEntryTab: null });
  });

  it('打开时停在分类首页，全屏无居中 transform', async () => {
    render(<SettingsModal />);

    expect(await screen.findByRole('button', { name: /General/ })).toBeInTheDocument();
    for (const name of [/Appearance/, /Assistant/, /Data/, /About/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.queryByText('AppearancePage')).not.toBeInTheDocument();
    const fixedRoot = document.querySelector('[class*="fixed"][class*="z-50"]');
    expect(fixedRoot?.className ?? '').not.toContain('translate-x-[-50%]');
  });

  it('点分类推入详情页，返回按钮回到首页', async () => {
    const user = userEvent.setup();
    render(<SettingsModal />);

    await user.click(await screen.findByRole('button', { name: /General/ }));
    expect(await screen.findByText('GeneralPage')).toBeVisible();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('General');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Settings');
    expect(screen.queryByText('GeneralPage')).not.toBeInTheDocument();
  });

  it('Escape（Android 返回手势）先逐级后退，在首页才关闭设置', async () => {
    const user = userEvent.setup();
    render(<SettingsModal />);

    await user.click(await screen.findByRole('button', { name: /Data/ }));
    expect(await screen.findByText('DataPage')).toBeVisible();

    await user.keyboard('[Escape]');
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Settings');
    expect(useUiInteractionStore.getState().settingsOpen).toBe(true);

    await user.keyboard('[Escape]');
    expect(useUiInteractionStore.getState().settingsOpen).toBe(false);
  });

  it('显式指定分类打开时直接落在该分类', async () => {
    useUiInteractionStore.setState({ settingsOpen: false });
    render(<SettingsModal />);

    act(() => useUiInteractionStore.getState().openSettings('assistant'));

    expect(await screen.findByText('AssistantPage')).toBeVisible();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Assistant');
  });
});
