import { lazy, Suspense, useEffect, useState } from 'react';
import { useUiInteractionStore } from '@taskora/api';

import { useAssistantPanelLayout } from '../agent/assistant-panel-layout';

const AssistantPanel = lazy(() =>
  import('../agent/AssistantPanel').then((module) => ({ default: module.AssistantPanel })),
);
const SettingsModal = lazy(() =>
  import('../settings/SettingsModal').then((module) => ({ default: module.SettingsModal })),
);

/** 首次打开才加载；之后保持挂载，保留原有关闭时的状态和清理行为。 */
function useHasOpened(open: boolean): boolean {
  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);
  return open || hasOpened;
}

export function LazyAssistantPanel() {
  const { visible, width } = useAssistantPanelLayout();
  const mounted = useHasOpened(visible);
  return mounted ? (
    <Suspense fallback={<div style={{ width }} className="shrink-0 border-l" aria-busy="true" />}>
      <AssistantPanel />
    </Suspense>
  ) : null;
}

export function LazySettingsModal() {
  const open = useUiInteractionStore((state) => state.settingsOpen);
  const mounted = useHasOpened(open);
  return mounted ? (
    <Suspense fallback={null}>
      <SettingsModal />
    </Suspense>
  ) : null;
}
