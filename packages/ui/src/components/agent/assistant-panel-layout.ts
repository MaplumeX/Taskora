import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ASSISTANT_PANEL_MIN_WIDTH, useAssistantUiStore, useSidebarUiStore } from '@taskora/api';

import { useIsDesktop } from '../../lib/use-media-query';

/** Room the content always keeps beside the panel. */
export const ASSISTANT_PANEL_CONTENT_MIN_WIDTH = 560;

export interface AssistantPanelLayout {
  /** Only on desktop, never on the full-screen `/agent`. */
  visible: boolean;
  viewport: number;
  /** Widest the panel may get: half the viewport, and the content keeps its minimum. */
  maxWidth: number;
  /** The saved panel width within `maxWidth`. */
  width: number;
}

/**
 * How the panel shares the window (assistant-panel spec §3). It always sits
 * beside the content — never floating over it — and never squeezes the
 * content below its minimum width.
 */
export function useAssistantPanelLayout(): AssistantPanelLayout {
  const { pathname } = useLocation();
  const open = useAssistantUiStore((s) => s.panelOpen);
  const storedWidth = useAssistantUiStore((s) => s.panelWidth);
  const desktop = useIsDesktop();
  const viewport = useViewportWidth();
  // 即使面板尚未按需加载，进入全屏助手也保持原有关闭侧栏面板的行为。
  useEffect(() => {
    if (pathname.startsWith('/agent')) useAssistantUiStore.getState().setPanelOpen(false);
  }, [pathname]);
  const visible = open && desktop && !pathname.startsWith('/agent');
  const maxWidth = Math.max(
    ASSISTANT_PANEL_MIN_WIDTH,
    Math.min(Math.floor(viewport / 2), viewport - ASSISTANT_PANEL_CONTENT_MIN_WIDTH),
  );
  return { visible, viewport, maxWidth, width: clampWidth(storedWidth, maxWidth) };
}

/**
 * When sidebar + content + panel don't fit, the sidebar collapses first and
 * expands again once there is room (panel closed, window widened). Only the
 * panel and the window drive this — resizing the sidebar itself never
 * collapses it — and once the user opens or closes the sidebar by hand it is
 * theirs again. Keyed on the saved panel width, so nothing flickers mid-drag.
 */
export function useSidebarYieldsToPanel(): void {
  const { visible, viewport, width } = useAssistantPanelLayout();
  useEffect(() => {
    const sidebar = useSidebarUiStore.getState();
    const crowded = visible && viewport < sidebar.width + ASSISTANT_PANEL_CONTENT_MIN_WIDTH + width;
    if (crowded && !sidebar.collapsed) sidebar.setAutoCollapsed(true);
    else if (!crowded && sidebar.autoCollapsed) sidebar.setAutoCollapsed(false);
  }, [visible, viewport, width]);
}

/**
 * Leave the full-screen view for the panel, keeping the conversation (it is
 * shared): back to where the user came from, else Today.
 */
export function useDockToPanel(): () => void {
  const navigate = useNavigate();
  // React Router keys the entry the app was opened on 'default': nothing
  // in-app to go back to.
  const { key } = useLocation();
  return useCallback(() => {
    useAssistantUiStore.getState().setPanelOpen(true);
    if (key !== 'default') navigate(-1);
    else navigate('/today');
  }, [navigate, key]);
}

export function clampWidth(width: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(ASSISTANT_PANEL_MIN_WIDTH, width));
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}
