import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsModal } from './SettingsModal';
import { useUiInteractionStore } from '@taskora/api';

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

describe('SettingsModal — 移动端 / 桌面端骨架', () => {
  beforeEach(() => {
    useUiInteractionStore.setState({ settingsOpen: true, settingsTab: 'general' });
  });

  it('移动端渲染全屏设置页（无居中 transform）', async () => {
    setDesktop(false);
    render(<SettingsModal />);

    expect(await screen.findByText('GeneralPage')).toBeTruthy();
    // 移动端骨架是 fixed 全屏，绝不应带 translate 居中（否则全屏面板被拉进弹窗盒）。
    const fixedRoot = document.querySelector('[class*="fixed"][class*="z-50"]');
    expect(fixedRoot?.className ?? '').not.toContain('translate-x-[-50%]');
    expect(fixedRoot?.className ?? '').not.toContain('translate-y-[-50%]');
  });

  it('桌面端渲染居中弹窗（含居中 transform）', async () => {
    setDesktop(true);
    render(<SettingsModal />);

    expect(await screen.findByText('GeneralPage')).toBeTruthy();
    const fixedRoot = document.querySelector('[class*="translate-x"][class*="z-50"]');
    expect(fixedRoot?.className ?? '').toContain('translate-x-[-50%]');
  });
});
