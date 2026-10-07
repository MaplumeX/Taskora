/**
 * 键位解析器（ADR-0004）：事件 + 平台 + 用户自定义键位 → 动作。
 *
 * 默认键位约定（用户可在设置中改绑，见 ADR-0017）：
 * - mac（Tauri macOS）：Things 原键位（⌘）
 * - windows（Tauri Windows）：⌘ → Ctrl 自适应
 * - web：浏览器保留键不可拦截，系统性降级为 Alt 系
 *
 * 键位完整对照表见 docs/keyboard-shortcuts.md。
 */

export type KeyPlatform = 'mac' | 'windows' | 'web';

export type KeyAction =
  /** ⌘/Ctrl/Alt + 1..6 → 跳转 Bucket（1=Inbox … 6=Logbook）。 */
  | { type: 'navigate'; index: 1 | 2 | 3 | 4 | 5 | 6 }
  /** 返回上一列表。Web 端不派发（浏览器自带 Alt+← 后退）。 */
  | { type: 'back' }
  | { type: 'moveUp' }
  | { type: 'moveDown' }
  | { type: 'moveFirst' }
  | { type: 'moveLast' }
  /** ⇧↑ / ⇧↓：从锚点扩展（或收缩）连续多选。 */
  | { type: 'extendUp' }
  | { type: 'extendDown' }
  | { type: 'selectAll' }
  /** ⌘K/Ctrl+K：完成选中；Logbook 中撤销完成。 */
  | { type: 'complete' }
  /** ⌥⌘K / Ctrl+Alt+K / Alt+Shift+K：取消选中；Logbook 中撤销取消。 */
  | { type: 'cancel' }
  /** ⌫/Delete：移入 Trash；Trash 页遵循该页约定（恢复）。 */
  | { type: 'delete' }
  /** Enter：行内展开选中任务。 */
  | { type: 'expand' }
  /** Space：选中项下方新建任务（无选中时等同 newTask）。 */
  | { type: 'newTaskBelow' }
  | { type: 'newTask' }
  | { type: 'newProject' }
  | { type: 'newHeading' }
  /** ⌘F/Ctrl+F：打开搜索。 */
  | { type: 'search' }
  /** ⇧⌘T / Ctrl+Shift+T / Alt+Shift+T：对选中项打开 Tag Picker。 */
  | { type: 'tags' }
  /** ⌘J / Ctrl+J / Alt+J：开关助手面板（`/agent` 页为「收回到面板」）。 */
  | { type: 'toggleAssistantPanel' }
  /**
   * 打字唤起 Quick Find：无修饰（可带 Shift）的单个可打印字符，seed 为该字符；
   * 输入法组合的首键 seed 为空（只打开并聚焦，不带入字符）。
   */
  | { type: 'typeToFind'; seed: string };

/** 解析器所需的最小事件形状（便于测试构造）。 */
export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** 物理键位（KeyboardEvent.code）；带 Alt/Shift 时用于还原字母数字。 */
  code?: string;
  isComposing?: boolean;
  keyCode?: number;
}

/** 运行时平台检测：Tauri 注入对象 + UA 判定；非 Tauri 一律视为 web。 */
export function detectKeyPlatform(): KeyPlatform {
  if (typeof window === 'undefined') return 'web';
  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (!isTauri) return 'web';
  const ua = navigator.userAgent;
  return /Mac|iPhone|iPad/.test(ua) ? 'mac' : 'windows';
}

/** ⌘1..⌘6 跳转的 Bucket 路由（顺序见 docs/keyboard-shortcuts.md）。 */
export const BUCKET_ROUTES = [
  '/inbox',
  '/today',
  '/upcoming',
  '/anytime',
  '/someday',
  '/logbook',
] as const;

/* ───────────────────────── 键位注册表 ───────────────────────── */

/**
 * 键位（chord）的规范字符串：修饰键按 Ctrl → Alt → Shift → Meta 排列，
 * 末段为键名（字母大写、数字、`Space`、`Plus`，或 KeyboardEvent.key 的
 * 命名键如 `ArrowUp` / `Enter` / `Backspace`）。例：`Shift+Meta+T`、`Alt+1`。
 * 存的是物理修饰键（mac 的 ⌘ 是 Meta，Windows 的 Ctrl 是 Ctrl），用户在
 * 哪个平台录制就存哪个平台的键位。
 */
export type Chord = string;

/** 设置页的分组（与 docs/keyboard-shortcuts.md 的小节一致）。 */
export type ShortcutGroup =
  'navigation' | 'selection' | 'create' | 'complete' | 'edit' | 'global' | 'quickAdd';

/**
 * 键位作用域：主窗口（KeyboardShortcuts）与 Quick Add 卡片（独立浮窗）各自
 * 解析，冲突只在同一作用域内判定。
 */
export type ShortcutScope = 'app' | 'quickAdd';

/** 可自定义的快捷键（一个动作一项；1..6 导航拆成 6 项）。 */
export type ShortcutId =
  | 'navigateInbox'
  | 'navigateToday'
  | 'navigateUpcoming'
  | 'navigateAnytime'
  | 'navigateSomeday'
  | 'navigateLogbook'
  | 'back'
  | 'moveUp'
  | 'moveDown'
  | 'moveFirst'
  | 'moveLast'
  | 'extendUp'
  | 'extendDown'
  | 'selectAll'
  | 'newTask'
  | 'newTaskBelow'
  | 'newProject'
  | 'newHeading'
  | 'complete'
  | 'cancel'
  | 'delete'
  | 'tags'
  | 'expand'
  | 'search'
  | 'toggleAssistantPanel'
  | 'quickAddSubmit'
  | 'quickAddSubmitAndContinue'
  | 'quickAddWhen'
  | 'quickAddToday'
  | 'quickAddSomeday'
  | 'quickAddDeadline'
  | 'quickAddTags'
  | 'quickAddMove';

interface ShortcutDefBase {
  id: ShortcutId;
  group: ShortcutGroup;
  /** 各平台默认键位；可有多个（如 ⌫ 与 Delete），空数组表示该平台默认不绑定。 */
  defaults: Record<KeyPlatform, Chord[]>;
}

export type ShortcutDef =
  | (ShortcutDefBase & { scope: 'app'; action: Exclude<KeyAction, { type: 'typeToFind' }> })
  | (ShortcutDefBase & { scope: 'quickAdd'; action: QuickAddKeyAction });

/** 三平台同一组修饰：mac ⌘ / Windows Ctrl / Web Ctrl 或 ⌘。 */
function primaryDefaults(key: string): Record<KeyPlatform, Chord[]> {
  return { mac: [`Meta+${key}`], windows: [`Ctrl+${key}`], web: [`Ctrl+${key}`, `Meta+${key}`] };
}

function samePerPlatform(...chords: Chord[]): Record<KeyPlatform, Chord[]> {
  return { mac: chords, windows: chords, web: chords };
}

function navigateDef(id: ShortcutId, index: 1 | 2 | 3 | 4 | 5 | 6): ShortcutDef {
  return {
    id,
    scope: 'app',
    group: 'navigation',
    action: { type: 'navigate', index },
    defaults: { mac: [`Meta+${index}`], windows: [`Ctrl+${index}`], web: [`Alt+${index}`] },
  };
}

/** Quick Add 卡片键位：主修饰键（+ ⇧）+ 键；浮窗只在桌面端出现。 */
function quickAddDef(
  id: ShortcutId,
  action: QuickAddKeyAction,
  key: string,
  shift = false,
): ShortcutDef {
  const mod = shift ? `Shift+${key}` : key;
  return {
    id,
    scope: 'quickAdd',
    group: 'quickAdd',
    action,
    defaults: {
      mac: [shift ? `Shift+Meta+${key}` : `Meta+${key}`],
      windows: [`Ctrl+${mod}`],
      web: [`Ctrl+${mod}`, shift ? `Shift+Meta+${key}` : `Meta+${key}`],
    },
  };
}

/**
 * 全部可自定义快捷键及默认键位（顺序即设置页的展示顺序）。
 * 默认键位与 docs/keyboard-shortcuts.md 的键位表一致：
 * - mac（Tauri macOS）：Things 原键位（⌘）
 * - windows（Tauri Windows）：⌘ → Ctrl 自适应
 * - web：浏览器保留键不可拦截，系统性降级为 Alt 系
 */
export const SHORTCUTS: readonly ShortcutDef[] = [
  navigateDef('navigateInbox', 1),
  navigateDef('navigateToday', 2),
  navigateDef('navigateUpcoming', 3),
  navigateDef('navigateAnytime', 4),
  navigateDef('navigateSomeday', 5),
  navigateDef('navigateLogbook', 6),
  // Web 不绑定：浏览器自带 Alt+← 后退。
  {
    id: 'back',
    scope: 'app',
    group: 'navigation',
    action: { type: 'back' },
    defaults: { mac: ['Meta+ArrowLeft'], windows: ['Alt+ArrowLeft'], web: [] },
  },
  {
    id: 'moveUp',
    scope: 'app',
    group: 'selection',
    action: { type: 'moveUp' },
    defaults: samePerPlatform('ArrowUp'),
  },
  {
    id: 'moveDown',
    scope: 'app',
    group: 'selection',
    action: { type: 'moveDown' },
    defaults: samePerPlatform('ArrowDown'),
  },
  {
    id: 'moveFirst',
    scope: 'app',
    group: 'selection',
    action: { type: 'moveFirst' },
    defaults: samePerPlatform('Alt+ArrowUp'),
  },
  {
    id: 'moveLast',
    scope: 'app',
    group: 'selection',
    action: { type: 'moveLast' },
    defaults: samePerPlatform('Alt+ArrowDown'),
  },
  {
    id: 'extendUp',
    scope: 'app',
    group: 'selection',
    action: { type: 'extendUp' },
    defaults: samePerPlatform('Shift+ArrowUp'),
  },
  {
    id: 'extendDown',
    scope: 'app',
    group: 'selection',
    action: { type: 'extendDown' },
    defaults: samePerPlatform('Shift+ArrowDown'),
  },
  {
    id: 'selectAll',
    scope: 'app',
    group: 'selection',
    action: { type: 'selectAll' },
    defaults: primaryDefaults('A'),
  },
  {
    id: 'newTask',
    scope: 'app',
    group: 'create',
    action: { type: 'newTask' },
    defaults: { mac: ['Meta+N'], windows: ['Ctrl+N'], web: ['Alt+N'] },
  },
  {
    id: 'newTaskBelow',
    scope: 'app',
    group: 'create',
    action: { type: 'newTaskBelow' },
    defaults: samePerPlatform('Space'),
  },
  {
    id: 'newProject',
    scope: 'app',
    group: 'create',
    action: { type: 'newProject' },
    defaults: { mac: ['Alt+Meta+N'], windows: ['Ctrl+Alt+N'], web: ['Alt+Shift+N'] },
  },
  // Web：Alt+Shift+N 已被新项目占用，Heading 走 Alt+H。
  {
    id: 'newHeading',
    scope: 'app',
    group: 'create',
    action: { type: 'newHeading' },
    defaults: { mac: ['Shift+Meta+N'], windows: ['Ctrl+Shift+N'], web: ['Alt+H'] },
  },
  {
    id: 'complete',
    scope: 'app',
    group: 'complete',
    action: { type: 'complete' },
    defaults: primaryDefaults('K'),
  },
  // Web 的 Ctrl+Alt 系被浏览器/输入法占用，降级为 Alt+Shift。
  {
    id: 'cancel',
    scope: 'app',
    group: 'complete',
    action: { type: 'cancel' },
    defaults: { mac: ['Alt+Meta+K'], windows: ['Ctrl+Alt+K'], web: ['Alt+Shift+K'] },
  },
  {
    id: 'delete',
    scope: 'app',
    group: 'complete',
    action: { type: 'delete' },
    defaults: samePerPlatform('Backspace', 'Delete'),
  },
  // Web 的 Ctrl+Shift+T 是浏览器「重新打开标签页」，拦截不了。
  {
    id: 'tags',
    scope: 'app',
    group: 'edit',
    action: { type: 'tags' },
    defaults: { mac: ['Shift+Meta+T'], windows: ['Ctrl+Shift+T'], web: ['Alt+Shift+T'] },
  },
  {
    id: 'expand',
    scope: 'app',
    group: 'edit',
    action: { type: 'expand' },
    defaults: samePerPlatform('Enter'),
  },
  {
    id: 'search',
    scope: 'app',
    group: 'global',
    action: { type: 'search' },
    defaults: primaryDefaults('F'),
  },
  // Web 的 Ctrl+J 是浏览器下载页。
  {
    id: 'toggleAssistantPanel',
    scope: 'app',
    group: 'global',
    action: { type: 'toggleAssistantPanel' },
    defaults: { mac: ['Meta+J'], windows: ['Ctrl+J'], web: ['Alt+J'] },
  },
  // Quick Add 卡片（桌面浮窗）：沿用 docs/keyboard-shortcuts.md 的 P1 / P2 键位。
  quickAddDef('quickAddSubmit', 'submit', 'Enter'),
  quickAddDef('quickAddSubmitAndContinue', 'submitAndContinue', 'Enter', true),
  quickAddDef('quickAddWhen', 'when', 'S'),
  quickAddDef('quickAddToday', 'today', 'T'),
  quickAddDef('quickAddSomeday', 'someday', 'O'),
  quickAddDef('quickAddDeadline', 'deadline', 'D', true),
  quickAddDef('quickAddTags', 'tags', 'T', true),
  quickAddDef('quickAddMove', 'move', 'M', true),
];

const SHORTCUT_BY_ID = new Map(SHORTCUTS.map((def) => [def.id, def]));

/** 用户改过的键位（只存改过的项；空数组表示用户解绑了该动作）。 */
export type KeyBindingOverrides = Partial<Record<ShortcutId, Chord[]>>;

/** 某动作当前生效的键位：用户覆盖优先，否则取平台默认。 */
export function bindingsFor(
  id: ShortcutId,
  platform: KeyPlatform,
  overrides?: KeyBindingOverrides,
): Chord[] {
  return overrides?.[id] ?? SHORTCUT_BY_ID.get(id)?.defaults[platform] ?? [];
}

/** 当前平台下已被占用该键位的动作（排除 except 本身）。 */
export function findChordOwner(
  chord: Chord,
  platform: KeyPlatform,
  overrides?: KeyBindingOverrides,
  except?: ShortcutId,
): ShortcutId | null {
  const scope = (except && SHORTCUT_BY_ID.get(except)?.scope) || 'app';
  for (const def of SHORTCUTS) {
    if (def.id === except || def.scope !== scope) continue;
    if (bindingsFor(def.id, platform, overrides).includes(chord)) return def.id;
  }
  return null;
}

const MODIFIER_KEYS = new Set([
  'Control',
  'Alt',
  'Shift',
  'Meta',
  'OS',
  'AltGraph',
  'CapsLock',
  'Fn',
]);

/** 事件的键名：字母大写、空格为 Space；带 Alt/Shift 时字母数字按物理键取（⌥N 在 mac 上 key 为 ˜）。 */
function chordKey(e: KeyEventLike): string | null {
  if (MODIFIER_KEYS.has(e.key) || e.key === 'Dead' || e.key === 'Unidentified') {
    return e.key === 'Dead' && e.code ? codeKey(e.code) : null;
  }
  if ((e.altKey || e.shiftKey) && e.code) {
    const physical = codeKey(e.code);
    if (physical) return physical;
  }
  if (e.key === ' ') return 'Space';
  if (e.key === '+') return 'Plus';
  if ([...e.key].length === 1) return e.key.toUpperCase();
  return e.key;
}

function codeKey(code: string): string | null {
  const m = /^(?:Key([A-Z])|Digit(\d))$/.exec(code);
  return m ? (m[1] ?? m[2]) : null;
}

/** 事件 → 规范键位；单按修饰键、输入法组字中返回 null。 */
export function chordFromEvent(e: KeyEventLike): Chord | null {
  if (e.isComposing || e.keyCode === 229 || e.key === 'Process') return null;
  const key = chordKey(e);
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  parts.push(key);
  return parts.join('+');
}

/** 键位 → 动作的查找表（按平台 + 覆盖缓存，覆盖对象不可变替换）。 */
const lookupCache = new WeakMap<object, Map<string, Map<Chord, ShortcutDef>>>();
const NO_OVERRIDES: KeyBindingOverrides = {};

function lookupFor(scope: ShortcutScope, platform: KeyPlatform, overrides: KeyBindingOverrides) {
  let byKey = lookupCache.get(overrides);
  if (!byKey) lookupCache.set(overrides, (byKey = new Map()));
  const cacheKey = `${scope}:${platform}`;
  let table = byKey.get(cacheKey);
  if (!table) {
    table = new Map();
    for (const def of SHORTCUTS) {
      if (def.scope !== scope) continue;
      for (const chord of bindingsFor(def.id, platform, overrides)) {
        if (!table.has(chord)) table.set(chord, def);
      }
    }
    byKey.set(cacheKey, table);
  }
  return table;
}

export function resolveAction(
  e: KeyEventLike,
  platform: KeyPlatform,
  overrides: KeyBindingOverrides = NO_OVERRIDES,
): KeyAction | null {
  const chord = chordFromEvent(e);
  const def = chord ? lookupFor('app', platform, overrides).get(chord) : undefined;
  if (def?.scope === 'app') return def.action;

  // --- 打字唤起 Quick Find（未被键位占用的无修饰字符；空格归「下方新建」） ---
  if (!e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.isComposing || e.keyCode === 229 || e.key === 'Process') {
      return { type: 'typeToFind', seed: '' };
    }
    if ([...e.key].length === 1 && e.key !== ' ') return { type: 'typeToFind', seed: e.key };
  }

  return null;
}

/* ───────────────────────── 展示文案 ───────────────────────── */

const MAC_KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '↵',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: 'Esc',
  Tab: '⇥',
  Plus: '+',
};

const OTHER_KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Plus: '+',
};

/** 运行时操作系统是否为 Apple 系（Web 端据此决定展示 ⌘ 还是 Ctrl）。 */
export function isAppleOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** Ctrl ↔ Meta 互换后的键位（Web 默认键位成对出现：Ctrl+K / Meta+K）。 */
function swapPrimary(chord: Chord): Chord | null {
  const parts = chord.split('+');
  const key = parts.pop() ?? '';
  const ctrl = parts.includes('Ctrl');
  const meta = parts.includes('Meta');
  if (ctrl === meta) return null;
  const mods = new Set(parts);
  mods.delete(ctrl ? 'Ctrl' : 'Meta');
  mods.add(ctrl ? 'Meta' : 'Ctrl');
  return [...['Ctrl', 'Alt', 'Shift', 'Meta'].filter((m) => mods.has(m)), key].join('+');
}

/**
 * 展示用的键位：Web 上 Ctrl / ⌘ 成对的键位只显示本机操作系统那一个
 * （macOS 显示 ⌘，其他显示 Ctrl）；两者都仍可触发（见 resolveAction）。
 */
export function visibleBindings(
  id: ShortcutId,
  platform: KeyPlatform,
  overrides?: KeyBindingOverrides,
  appleOS = isAppleOS(),
): Chord[] {
  const chords = bindingsFor(id, platform, overrides);
  if (platform !== 'web') return chords;
  const foreign = appleOS ? 'Ctrl' : 'Meta';
  return chords.filter((chord) => {
    if (!chord.split('+').includes(foreign)) return true;
    const native = swapPrimary(chord);
    return !native || !chords.includes(native);
  });
}

/**
 * 键位 → 展示文案：macOS（桌面端，或 Web 运行在 macOS 上）用 ⌃⌥⇧⌘ 符号
 * （如 ⇧⌘N）；其他用 `Ctrl+Alt+Shift+K` 文字，Meta 显示为 Win。
 */
export function formatChord(chord: Chord, platform: KeyPlatform, appleOS = isAppleOS()): string {
  const parts = chord.split('+');
  const key = parts.pop() ?? '';
  const mods = new Set(parts);
  if (platform === 'mac' || (platform === 'web' && appleOS)) {
    const symbols =
      (mods.has('Ctrl') ? '⌃' : '') +
      (mods.has('Alt') ? '⌥' : '') +
      (mods.has('Shift') ? '⇧' : '') +
      (mods.has('Meta') ? '⌘' : '');
    return symbols + (MAC_KEY_LABELS[key] ?? key);
  }
  const labels: string[] = [];
  if (mods.has('Ctrl')) labels.push('Ctrl');
  if (mods.has('Alt')) labels.push('Alt');
  if (mods.has('Shift')) labels.push('Shift');
  if (mods.has('Meta')) labels.push('Win');
  labels.push(OTHER_KEY_LABELS[key] ?? key);
  return labels.join('+');
}

/** 按钮上可展示 hint 快捷键的动作。 */
export type HintableAction =
  'search' | 'newTask' | 'newProject' | 'newHeading' | 'tags' | 'toggleAssistantPanel';

/**
 * 动作 → 当前生效键位（首个）的展示文案；与 resolveAction 同源于
 * SHORTCUTS + 用户覆盖。无键位（用户解绑）时返回 null（hint 只显示文案）。
 */
export function shortcutLabel(
  action: ShortcutId,
  platform: KeyPlatform,
  overrides?: KeyBindingOverrides,
  appleOS = isAppleOS(),
): string | null {
  const chord = visibleBindings(action, platform, overrides, appleOS)[0];
  return chord ? formatChord(chord, platform, appleOS) : null;
}

/**
 * Quick Add 卡片内的动作（quick-add-v2 issue 04）。浮窗是独立 webview，不
 * 装配主应用的 KeyboardShortcuts，键位在 SHORTCUTS 的 quickAdd 作用域
 * （默认 ⌘S When、⌘T Today、⌘O Someday、⇧⌘D Deadline、⇧⌘T Tags、
 * ⇧⌘M 移动、⌘↵ 提交），同样可被用户改绑。仅桌面（mac / windows）使用。
 */
export type QuickAddKeyAction =
  'when' | 'today' | 'someday' | 'deadline' | 'tags' | 'move' | 'submit' | 'submitAndContinue';

export function resolveQuickAddAction(
  e: KeyEventLike,
  platform: KeyPlatform,
  overrides: KeyBindingOverrides = NO_OVERRIDES,
): QuickAddKeyAction | null {
  const chord = chordFromEvent(e);
  const def = chord ? lookupFor('quickAdd', platform, overrides).get(chord) : undefined;
  return def?.scope === 'quickAdd' ? def.action : null;
}

const QUICK_ADD_IDS: Record<QuickAddKeyAction, ShortcutId> = {
  submit: 'quickAddSubmit',
  submitAndContinue: 'quickAddSubmitAndContinue',
  when: 'quickAddWhen',
  today: 'quickAddToday',
  someday: 'quickAddSomeday',
  deadline: 'quickAddDeadline',
  tags: 'quickAddTags',
  move: 'quickAddMove',
};

export function quickAddShortcutLabel(
  action: QuickAddKeyAction,
  platform: KeyPlatform,
  overrides?: KeyBindingOverrides,
): string | null {
  return shortcutLabel(QUICK_ADD_IDS[action], platform, overrides);
}

/* ───────────────────────── 系统级 Quick Add 快捷键 ───────────────────────── */

/** 系统级 Quick Add 的默认键位（Tauri accelerator，lib.rs 同值）。 */
export const DEFAULT_QUICK_ADD_ACCELERATOR = 'CmdOrCtrl+Shift+Space';

/** Tauri accelerator（`CmdOrCtrl+Shift+Space`）→ 规范键位。 */
export function acceleratorToChord(accelerator: string, platform: KeyPlatform): Chord {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const mods = new Set<string>();
  for (const part of parts) {
    const m = part.toLowerCase();
    if (m === 'cmdorctrl' || m === 'commandorcontrol')
      mods.add(platform === 'mac' ? 'Meta' : 'Ctrl');
    else if (m === 'ctrl' || m === 'control') mods.add('Ctrl');
    else if (m === 'alt' || m === 'option') mods.add('Alt');
    else if (m === 'shift') mods.add('Shift');
    else if (m === 'super' || m === 'cmd' || m === 'command' || m === 'meta') mods.add('Meta');
  }
  return [...['Ctrl', 'Alt', 'Shift', 'Meta'].filter((m) => mods.has(m)), key].join('+');
}

/**
 * 规范键位 → Tauri accelerator。系统级快捷键必须带 Ctrl / Alt / ⌘ 之一
 * （单键或只带 ⇧ 会吞掉全系统的输入），不满足时返回 null。
 */
export function chordToAccelerator(chord: Chord): string | null {
  const parts = chord.split('+');
  const key = parts.pop() ?? '';
  if (!parts.some((m) => m === 'Ctrl' || m === 'Alt' || m === 'Meta')) return null;
  if (key === 'Plus' || key === 'Dead') return null;
  return [...parts.map((m) => (m === 'Meta' ? 'Super' : m)), key].join('+');
}
