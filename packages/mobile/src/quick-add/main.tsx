/**
 * Android 快速添加浮层入口（quick-add.html，由 vite.quick-add.config.ts
 * 打进 statusbar 插件的 assets，QuickAddActivity 的 WebView 加载）。
 *
 * 与桌面 quick-add 窗口同一套做法：不装配 Engine，卡片读的 useProjectsQuery
 * 等走 React Query 分支，数据来自主 WebView 推给原生的快照，按相同查询键
 * 写进缓存（staleTime Infinity，不会去调 REST）。草稿经宿主桥交给原生入队，
 * 由主 WebView 落库。
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  areaKeys,
  i18n,
  projectKeys,
  setClientKind,
  setSystemTheme,
  tagKeys,
  usePreferencesStore,
} from '@taskora/api';

import { parseQuickAddSnapshot } from '../status-bar/quick-add-snapshot';
import { getQuickAddHost } from './host';
import { closeOpenPicker, QuickAddOverlay } from './QuickAddOverlay';
import './quick-add.css';

const host = getQuickAddHost();
// 'mobile'：计划日期选择器显示 Reminder（提醒由主 App 按草稿落库后排程）。
setClientKind('mobile');

const snapshot = parseQuickAddSnapshot(host.getSnapshot());
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
// 没有快照时写空列表：选择器只剩 Inbox，也不会去请求 REST。
queryClient.setQueryData(projectKeys.all, snapshot?.projects ?? []);
queryClient.setQueryData(areaKeys.all, snapshot?.areas ?? []);
queryClient.setQueryData(tagKeys.all, snapshot?.tags ?? []);

if (snapshot) {
  usePreferencesStore.setState({
    timeZone: snapshot.timeZone,
    weekStartsOn: snapshot.weekStartsOn,
    language: snapshot.language,
  });
  void i18n.changeLanguage(snapshot.language);
}
setSystemTheme(host.isSystemDark() ? 'dark' : 'light');
usePreferencesStore.getState().setTheme(snapshot?.theme ?? 'system');

window.taskoraQuickAdd = { back: closeOpenPicker };

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <QuickAddOverlay host={host} />
    </QueryClientProvider>
  </React.StrictMode>,
);
