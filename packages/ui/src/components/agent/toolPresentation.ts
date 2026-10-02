import type { TFunction } from 'i18next';
import {
  ArrowUpDown,
  CircleCheck,
  Eye,
  List,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import type { ToolChatItem as ToolItem } from './buildChatItems';

/** Icon by tool-name verb prefix (list_/get_/create_/…). */
const ICON_BY_PREFIX: Array<[RegExp, LucideIcon]> = [
  [/^search/, Search],
  [/^list_/, List],
  [/^get_/, Eye],
  [/^create_/, Plus],
  [/^update_/, Pencil],
  [/^complete_/, CircleCheck],
  [/^restore_/, RotateCcw],
  [/^reorder_/, ArrowUpDown],
  [/^(delete_|empty_)/, Trash2],
];

export function toolIcon(toolName: string): LucideIcon {
  return ICON_BY_PREFIX.find(([re]) => re.test(toolName))?.[1] ?? Wrench;
}

/** Human action label ("Update task"); unknown tools fall back to the raw name. */
export function toolLabel(toolName: string, t: TFunction): string {
  return t(`agent:tool_${toolName}`, { defaultValue: toolName.replace(/_/g, ' ') });
}

/**
 * The one argument worth showing next to the label: the entity title (from
 * args or resolved from the transcript), the search query, or the view name.
 * Database ids are never shown.
 */
export function toolSubject(item: ToolItem, t: TFunction): string | null {
  const { args } = item;
  if (typeof args.title === 'string' && args.title) return `「${args.title}」`;
  if (item.entityTitle) return `「${item.entityTitle}」`;
  if (typeof args.q === 'string' && args.q) return `「${args.q}」`;
  if (typeof args.view === 'string') {
    return t(`nav:${args.view}`, { defaultValue: args.view });
  }
  if (Array.isArray(args.orderedIds)) {
    return t('agent:toolItemCount', { count: args.orderedIds.length });
  }
  return null;
}

/** "Update task 「Write report」" — label plus subject, for one-line status. */
export function describeTool(item: ToolItem, t: TFunction): string {
  return [toolLabel(item.toolName, t), toolSubject(item, t)].filter(Boolean).join(' ');
}
