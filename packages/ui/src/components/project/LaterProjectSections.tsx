import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProjectResponseDto } from '@taskora/shared';

import {
  currentLegacyDateTimeZone,
  selectionStateOf,
  useLaterProjectKind,
  useSelectionScope,
  useTaskRowSelection,
} from '@taskora/api';
import { mainNav, type NavItem } from '@/components/layout/navItems';
import { ProjectFeedRow } from '@/components/feed/ProjectFeedRow';
import { groupLaterProjects } from '@/components/project/laterProjectLayout';
import { cn } from '@/lib/utils';

// 小节标题沿用侧边栏对应 Bucket 的名称、图标与颜色（计划 = Upcoming，将来 = Someday）。
const navItem = (to: string) => mainNav.find((item) => item.to === to) as NavItem;
const SCHEDULED_NAV = navItem('/upcoming');
const SOMEDAY_NAV = navItem('/someday');

interface Props {
  /** 候选项目；非稍后项目会被忽略。 */
  projects: ProjectResponseDto[];
  /** 同页多个列表时，本组件在键盘遍历中的先后（见 useSelectionScope）。 */
  selectionRank?: number;
}

/**
 * 稍后项目的「计划」/「Someday」两个小节（Later Projects 页与区域页共用）。
 * 空小节不显示；两节都不支持拖拽排序（计划按日期，Someday 沿用手动顺序）。
 */
export function LaterProjectSections({ projects, selectionRank }: Props) {
  const { t } = useTranslation();
  const kindOf = useLaterProjectKind();
  const { selectedIds, expandedId } = useTaskRowSelection();
  const groups = useMemo(
    () => groupLaterProjects(projects, kindOf, currentLegacyDateTimeZone()),
    [projects, kindOf],
  );

  const rows = useMemo(
    () =>
      [...groups.scheduled, ...groups.someday].map((p) => ({
        id: p.id,
        kind: 'project' as const,
        completed: false,
        tagIds: (p.tags ?? []).map((tag) => tag.id),
      })),
    [groups],
  );
  useSelectionScope(rows, selectionRank);

  const sections = [
    { key: 'scheduled', nav: SCHEDULED_NAV, items: groups.scheduled },
    { key: 'someday', nav: SOMEDAY_NAV, items: groups.someday },
  ].filter((section) => section.items.length > 0);

  return (
    <>
      {sections.map((section) => {
        const Icon = section.nav.icon;
        const title = t(section.nav.labelKey);
        return (
          <section key={section.key} aria-label={title} className="flex flex-col">
            <h2 className="flex items-center gap-1.5 border-b border-border pb-1 text-section font-bold text-foreground">
              <Icon aria-hidden className={cn('h-4 w-4 shrink-0', section.nav.colorClass)} />
              {title}
            </h2>
            <div className="flex flex-col pt-1">
              {section.items.map((p) => (
                <ProjectFeedRow
                  key={p.id}
                  item={p}
                  selectionState={selectionStateOf(selectedIds, expandedId, p.id)}
                  showScheduledBadge={section.key === 'scheduled'}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
