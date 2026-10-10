import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { getClientKind, useKeybindingsStore } from '@taskora/api';

import { cn } from '@/lib/utils';
import {
  DEFAULT_QUICK_ADD_ACCELERATOR,
  SHORTCUTS,
  acceleratorToChord,
  bindingsFor,
  chordFromEvent,
  chordToAccelerator,
  detectKeyPlatform,
  findChordOwner,
  formatChord,
  isAppleOS,
  type Chord,
  type KeyBindingOverrides,
  type KeyPlatform,
  type ShortcutGroup,
  type ShortcutId,
  visibleBindings,
} from '@/components/keyboard/keymap';
import {
  getQuickAddAccelerator,
  setQuickAddAccelerator,
} from '@/components/keyboard/quickAddHotkey';

const APP_GROUPS: ShortcutGroup[] = [
  'navigation',
  'selection',
  'create',
  'complete',
  'edit',
  'dates',
  'move',
  'global',
  'review',
];

/** 录制目标：注册表里的动作，或系统级 Quick Add 快捷键。 */
type RecordTarget = ShortcutId | 'quickAddGlobal';

/** 录制时不当作键位的键：Esc 取消录制，Tab 留给焦点移动。 */
const UNBINDABLE_KEYS = new Set(['Escape', 'Tab']);

/** 桌面 Tauri 壳（移动端同样注入 __TAURI_INTERNALS__，须同时校验 clientKind）。 */
const isDesktopShell = () => '__TAURI_INTERNALS__' in globalThis && getClientKind() === 'desktop';

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-xs leading-none text-foreground">
      {children}
    </kbd>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="flex flex-col divide-y divide-border/60">{children}</ul>
    </section>
  );
}

function ShortcutRow({
  label,
  keys,
  recording,
  customized,
  onRecord,
  onCancel,
  onReset,
}: {
  label: string;
  keys: string[];
  recording: boolean;
  customized: boolean;
  onRecord: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <li className="flex min-h-10 items-center gap-3 py-1.5">
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <button
        type="button"
        aria-label={t('settings:shortcutEdit', { action: label })}
        aria-pressed={recording}
        onClick={recording ? onCancel : onRecord}
        onBlur={() => {
          if (recording) onCancel();
        }}
        className={cn(
          'flex min-h-7 min-w-24 items-center justify-end gap-1 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent',
          recording && 'bg-accent ring-2 ring-primary',
        )}
      >
        {recording ? (
          <span className="text-muted-foreground">{t('settings:shortcutRecording')}</span>
        ) : keys.length > 0 ? (
          keys.map((key) => <Kbd key={key}>{key}</Kbd>)
        ) : (
          <span className="text-muted-foreground">{t('settings:shortcutNone')}</span>
        )}
      </button>
      <button
        type="button"
        aria-label={t('settings:shortcutReset', { action: label })}
        onClick={onReset}
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          !customized && 'invisible',
        )}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function FixedRow({ label, keys }: { label: string; keys: string }) {
  return (
    <li className="flex min-h-10 items-center gap-3 py-1.5">
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <span className="px-2 text-sm">
        <Kbd>{keys}</Kbd>
      </span>
      <span aria-hidden className="w-7 shrink-0" />
    </li>
  );
}

interface Props {
  /** 平台，默认自动检测；测试可注入。 */
  platform?: KeyPlatform;
  /** 是否在桌面壳内（显示 Quick Add 分组），默认自动检测；测试可注入。 */
  desktopShell?: boolean;
}

/**
 * 设置 → 快捷键（ADR-0017）：列出全部快捷键，点击键位后按下新组合即改绑。
 * 改绑到同一作用域内已被占用的键位时，从原动作上移除该键位（原动作可能
 * 变为未设置）。系统级 Quick Add 快捷键会拦下全系统的按键，与之相同的
 * 应用内键位不允许设置；它自己改绑时则从应用内动作上移除该键位。
 */
export default function SettingsShortcuts({ platform: platformProp, desktopShell }: Props) {
  const { t } = useTranslation(['settings', 'common']);
  const platform = platformProp ?? detectKeyPlatform();
  const desktop = platform !== 'web' && (desktopShell ?? isDesktopShell());
  const overrides = useKeybindingsStore((s) => s.overrides) as KeyBindingOverrides;
  const setBindings = useKeybindingsStore((s) => s.setBindings);
  const resetBinding = useKeybindingsStore((s) => s.resetBinding);
  const resetAll = useKeybindingsStore((s) => s.resetAll);
  const [recording, setRecording] = useState<RecordTarget | null>(null);
  /** 系统级 Quick Add 快捷键（Tauri accelerator）；null 为尚未读取。 */
  const [globalAccelerator, setGlobalAccelerator] = useState<string | null>(null);

  useEffect(() => {
    if (!desktop) return;
    getQuickAddAccelerator().then(setGlobalAccelerator, () => undefined);
  }, [desktop]);

  const actionLabel = (id: RecordTarget) => t(`settings:shortcut_${id}`);
  const globalChord: Chord | null = globalAccelerator
    ? acceleratorToChord(globalAccelerator, platform)
    : null;
  const globalCustomized =
    globalAccelerator !== null && globalAccelerator !== DEFAULT_QUICK_ADD_ACCELERATOR;

  const changeGlobal = (accelerator: string | null, chord: Chord | null) => {
    setQuickAddAccelerator(accelerator).then(
      (next) => {
        setGlobalAccelerator(next);
        if (!chord) return;
        // 系统级快捷键会先于应用拿到按键：应用内同键位的动作一并移除。
        const current = useKeybindingsStore.getState().overrides as KeyBindingOverrides;
        const changes: Record<string, string[]> = {};
        for (const def of SHORTCUTS) {
          const chords = bindingsFor(def.id, platform, current);
          if (chords.includes(chord)) changes[def.id] = chords.filter((c) => c !== chord);
        }
        const owners = Object.keys(changes) as ShortcutId[];
        if (owners.length === 0) return;
        setBindings(changes);
        toast(t('settings:shortcutReassigned', { action: owners.map(actionLabel).join('、') }));
      },
      () => toast.error(t('settings:shortcutGlobalRegisterFailed')),
    );
  };

  // 录制：window 捕获阶段先于全局 keymap 与 Radix Dialog 的 Esc 处理拿到按键。
  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      if (UNBINDABLE_KEYS.has(e.key)) {
        setRecording(null);
        return;
      }
      const chord = chordFromEvent(e);
      if (!chord) return; // 单按修饰键：继续等待
      setRecording(null);

      if (recording === 'quickAddGlobal') {
        const accelerator = chordToAccelerator(chord);
        if (!accelerator) {
          toast.error(t('settings:shortcutGlobalNeedsModifier'));
          return;
        }
        changeGlobal(accelerator, chord);
        return;
      }

      if (desktop && chord === globalChord) {
        toast.error(t('settings:shortcutTakenByGlobal'));
        return;
      }
      const current = useKeybindingsStore.getState().overrides as KeyBindingOverrides;
      const changes: Record<string, string[]> = { [recording]: [chord] };
      const owner = findChordOwner(chord, platform, current, recording);
      if (owner) {
        changes[owner] = bindingsFor(owner, platform, current).filter((c) => c !== chord);
        toast(t('settings:shortcutReassigned', { action: actionLabel(owner) }));
      }
      setBindings(changes);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  });

  const hasOverrides = Object.keys(overrides).length > 0 || globalCustomized;
  const mac = platform === 'mac' || (platform === 'web' && isAppleOS());

  const shortcutRows = (group: ShortcutGroup) =>
    SHORTCUTS.filter((def) => def.group === group).map((def) => (
      <ShortcutRow
        key={def.id}
        label={actionLabel(def.id)}
        keys={visibleBindings(def.id, platform, overrides).map((c) => formatChord(c, platform))}
        recording={recording === def.id}
        customized={def.id in overrides}
        onRecord={() => setRecording(def.id)}
        onCancel={() => setRecording(null)}
        onReset={() => resetBinding(def.id)}
      />
    ));

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">{t('settings:shortcutsHint')}</p>
        <button
          type="button"
          disabled={!hasOverrides}
          onClick={() => {
            resetAll();
            setRecording(null);
            if (globalCustomized) changeGlobal(null, null);
          }}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          {t('settings:shortcutsResetAll')}
        </button>
      </div>

      {APP_GROUPS.map((group) => (
        <Section key={group} title={t(`settings:shortcutGroup_${group}`)}>
          {shortcutRows(group)}
        </Section>
      ))}

      {desktop && (
        <Section title={t('settings:shortcutGroup_quickAdd')}>
          <ShortcutRow
            label={actionLabel('quickAddGlobal')}
            keys={globalChord ? [formatChord(globalChord, platform)] : []}
            recording={recording === 'quickAddGlobal'}
            customized={globalCustomized}
            onRecord={() => setRecording('quickAddGlobal')}
            onCancel={() => setRecording(null)}
            onReset={() => changeGlobal(null, null)}
          />
          {shortcutRows('quickAdd')}
        </Section>
      )}

      <Section title={t('settings:shortcutGroup_fixed')}>
        {desktop && (
          <>
            <FixedRow
              label={t('settings:shortcutFixedQuickAddEnter')}
              keys={formatChord('Enter', platform)}
            />
            <FixedRow
              label={t('settings:shortcutFixedQuickAddEscape')}
              keys={formatChord('Escape', platform)}
            />
          </>
        )}
        <FixedRow
          label={t('settings:shortcutFixedSave')}
          keys={formatChord(mac ? 'Meta+Enter' : 'Ctrl+Enter', platform)}
        />
        <FixedRow
          label={t('settings:shortcutFixedTypeToFind')}
          keys={t('settings:shortcutFixedTypeToFindKeys')}
        />
      </Section>
    </div>
  );
}
