import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAreasQuery, useLaterProjectKind, useProjectsQuery } from '@taskora/api';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MovePickerList } from '@/components/common/MovePickerList';
import { LIST_TARGETS } from '@/components/search/QuickFindRow';
import { MoveTargetRow } from '@/components/task/fields/MovePicker';
import { buildMoveTargets, type MoveTarget } from '@/components/task/fields/moveTargets';
import { cn } from '@/lib/utils';
import { needleOf, rankByName } from '../../lib/nameMatch';

type ListEntry = (typeof LIST_TARGETS)[number];

/** 导航目标：内置列表，或区域 / 项目（与移动选择器同序同外观）。 */
export type NavigationTarget =
  | { kind: 'list'; id: string; route: string; list: ListEntry; names: string[] }
  | { kind: 'place'; id: string; route: string; place: MoveTarget };

function placeRoute(place: MoveTarget): string | null {
  if (place.kind === 'area') return `/areas/${place.area.id}`;
  if (place.kind === 'project') return `/projects/${place.project.id}`;
  return null;
}

interface Props {
  onClose: () => void;
  onNavigate: (route: string) => void;
}

/**
 * ⇧⌘O 导航弹窗（Things 的 Navigation Popover）：不输入时列出全部内置列表，
 * 其后是与侧边栏同序的区域与项目；输入即按名称过滤（前缀命中优先）。
 * ↑/↓ 移动、Enter 前往、Esc 关闭。与 Quick Find 不同，它只跳转列表，不搜任务。
 */
export function NavigationPopover({ onClose, onNavigate }: Props) {
  const { t, i18n } = useTranslation();
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const kindOf = useLaterProjectKind();
  const [query, setQuery] = useState('');

  const targets = useMemo<NavigationTarget[]>(() => {
    const english = i18n.getFixedT('en');
    const lists = LIST_TARGETS.map((list): NavigationTarget => ({
      kind: 'list',
      id: `list:${list.to}`,
      route: list.to,
      list,
      names: [t(list.labelKey), english(list.labelKey)],
    }));
    const places = buildMoveTargets({
      query,
      projects,
      areas,
      inboxNames: [],
      isLater: (project) => kindOf(project) !== null,
    }).flatMap((place): NavigationTarget[] => {
      const route = placeRoute(place);
      return route ? [{ kind: 'place', id: place.id, route, place }] : [];
    });
    const needle = needleOf(query);
    const shownLists = needle
      ? rankByName(lists, (list) => (list.kind === 'list' ? list.names : []), needle)
      : lists;
    return [...shownLists, ...places];
  }, [query, projects, areas, kindOf, t, i18n]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideClose
        className="top-[12dvh] max-w-md translate-y-0 gap-0 p-2 max-md:top-[calc(0.5rem+var(--safe-area-top))]"
      >
        <DialogTitle className="sr-only">{t('nav:navigationTitle')}</DialogTitle>
        <MovePickerList
          targets={targets}
          currentId={null}
          query={query}
          onQueryChange={setQuery}
          onSelect={(target) => onNavigate(target.route)}
          searchPlaceholder={t('nav:navigationPlaceholder')}
          emptyMessage={t('nav:navigationNoResults')}
          listLabel={t('nav:navigationTitle')}
          renderTarget={(target) => <NavigationRow target={target} />}
          isNested={(target) =>
            target.kind === 'place' && target.place.kind === 'project' && target.place.nested
          }
        />
      </DialogContent>
    </Dialog>
  );
}

function NavigationRow({ target }: { target: NavigationTarget }) {
  if (target.kind === 'place') return <MoveTargetRow target={target.place} />;
  const Icon = target.list.icon;
  return (
    <>
      <Icon className={cn('h-4 w-4 shrink-0', target.list.colorClass ?? 'text-muted-foreground')} />
      <span className="truncate">{target.names[0]}</span>
    </>
  );
}
