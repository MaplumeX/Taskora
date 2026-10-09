import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Maximize2, MessagesSquare, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ASSISTANT_PANEL_DEFAULT_WIDTH,
  ASSISTANT_PANEL_MIN_WIDTH,
  useActiveConversation,
  useAssistantUiStore,
  useCreateConversation,
} from '@taskora/api';

import { AgentChatView } from './AgentChatView';
import { AgentEmptyState } from './AgentEmptyState';
import { clampWidth, useAssistantPanelLayout } from './assistant-panel-layout';

/** Recent conversations offered by the panel's title menu. */
const RECENT_LIMIT = 8;

/**
 * Right-hand Assistant panel: the same conversations as `/agent`, next to
 * whatever the user is looking at. Conversation management (rename, delete,
 * the full list) stays in the full-screen view.
 */
export function AssistantPanel() {
  const { t } = useTranslation(['agent']);
  const { visible, maxWidth } = useAssistantPanelLayout();
  const storedWidth = useAssistantUiStore((s) => s.panelWidth);
  // Live width while dragging; committed to the store on release.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = clampWidth(dragWidth ?? storedWidth, maxWidth);

  if (!visible) return null;

  return (
    <aside
      aria-label={t('agent:assistantPanel')}
      data-assistant-panel=""
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-background"
    >
      <ResizeHandle width={width} maxWidth={maxWidth} onDrag={setDragWidth} />
      <PanelFocus />
      <PanelContent />
    </aside>
  );
}

/** Arrow-key step when resizing from the keyboard. */
const KEYBOARD_STEP = 16;

/**
 * Left-edge grip: drag to resize (the panel grows leftwards), double-click
 * to restore the default width, ←/→ when focused. Dragging only updates
 * the live width; the store (localStorage) is written once on release.
 */
function ResizeHandle({
  width,
  maxWidth,
  onDrag,
}: {
  width: number;
  maxWidth: number;
  onDrag: (width: number | null) => void;
}) {
  const { t } = useTranslation(['agent']);
  const setPanelWidth = useAssistantUiStore((s) => s.setPanelWidth);
  const dragRef = useRef<{ startX: number; startWidth: number; width: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startWidth: width, width };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.width = clampWidth(drag.startWidth + drag.startX - e.clientX, maxWidth);
    onDrag(drag.width);
  };
  const endDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (drag.width !== drag.startWidth) setPanelWidth(drag.width);
    onDrag(null);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const delta =
      e.key === 'ArrowLeft' ? KEYBOARD_STEP : e.key === 'ArrowRight' ? -KEYBOARD_STEP : 0;
    if (!delta) return;
    e.preventDefault();
    setPanelWidth(clampWidth(width + delta, maxWidth));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('agent:resizePanel')}
      aria-valuenow={width}
      aria-valuemin={ASSISTANT_PANEL_MIN_WIDTH}
      aria-valuemax={maxWidth}
      tabIndex={0}
      className="group absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => setPanelWidth(ASSISTANT_PANEL_DEFAULT_WIDTH)}
      onKeyDown={onKeyDown}
    >
      {/* 悬停 / 拖动 / 键盘聚焦时显示的细线，压在面板左边框上 */}
      <div className="absolute inset-y-0 left-1 w-0.5 -translate-x-1/2 bg-primary opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100" />
    </div>
  );
}

/**
 * Opening the panel moves focus into its composer; closing it hands focus
 * back to where the user was (if focus was still inside the panel).
 */
function PanelFocus() {
  const markerRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = markerRef.current?.closest<HTMLElement>('[data-assistant-panel]');
    // The chat view may still be loading; focus once its composer exists.
    const frame = requestAnimationFrame(() => panel?.querySelector('textarea')?.focus());
    return () => {
      cancelAnimationFrame(frame);
      const active = document.activeElement;
      const focusLost = !active || active === document.body || !active.isConnected;
      if ((focusLost || panel?.contains(active)) && previous?.isConnected) previous.focus();
    };
  }, []);
  return <span ref={markerRef} hidden />;
}

function PanelContent() {
  const { t } = useTranslation(['agent']);
  const navigate = useNavigate();
  const { conversations, isLoading, active, activeId, setActiveId } = useActiveConversation();
  const create = useCreateConversation();
  const setPanelOpen = useAssistantUiStore((s) => s.setPanelOpen);

  const newConversation = () => create.mutate(undefined, { onSuccess: (c) => setActiveId(c.id) });
  // The panel hides itself on /agent; the full-screen view shows the same
  // (shared) active conversation.
  const openFullScreen = () => navigate('/agent');

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-0.5 border-b border-border px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="min-w-0 gap-1 px-2">
              <span className="truncate text-sm font-medium">
                {active?.title ?? t('agent:assistant')}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {conversations.slice(0, RECENT_LIMIT).map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => setActiveId(c.id)}>
                <span className="min-w-0 flex-1 truncate">{c.title ?? t('agent:untitled')}</span>
                {c.id === activeId ? <Check className="h-4 w-4 shrink-0" /> : null}
              </DropdownMenuItem>
            ))}
            {conversations.length > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem disabled={create.isPending} onSelect={newConversation}>
              <Plus className="h-4 w-4" />
              {t('agent:newConversation')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={openFullScreen}>
              <MessagesSquare className="h-4 w-4" />
              {t('agent:allConversations')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        <Hint label={t('agent:newConversation')} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('agent:newConversation')}
            disabled={create.isPending}
            onClick={newConversation}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </Hint>
        <Hint label={t('agent:openFullScreen')} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('agent:openFullScreen')}
            onClick={openFullScreen}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </Hint>
        <Hint label={t('agent:closePanel')} action="toggleAssistantPanel" side="bottom">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('agent:closePanel')}
            onClick={() => setPanelOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </Hint>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {activeId ? (
          <AgentChatView key={activeId} conversationId={activeId} variant="panel" />
        ) : (
          <AgentEmptyState loading={isLoading} />
        )}
      </div>
    </>
  );
}
