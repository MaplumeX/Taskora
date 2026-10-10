import {
  CalendarClock,
  CornerDownRight,
  Heading,
  Layers,
  Tag,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ProjectStatus, TaskStatus } from '@taskora/shared';

import { hiddenListNavs, mainNav, trashNav, type NavItem } from '@/components/layout/navItems';
import { ProjectProgressPie } from '@/components/project/ProjectProgressRing';
import { cn } from '@/lib/utils';
import { highlightParts, type QuickFindItem } from './quickFindResults';

/** 可搜到的内置列表（spec 第 1 节）：主导航 + 稍后项目 + 隐藏列表 + 废纸篓 + 标签。 */
export const LIST_TARGETS: Array<{
  to: string;
  labelKey: string;
  icon: NavItem['icon'];
  colorClass?: string;
}> = [
  ...mainNav,
  { to: '/later-projects', labelKey: 'project:laterProjects', icon: CalendarClock },
  ...hiddenListNavs,
  trashNav,
  { to: '/tags', labelKey: 'nav:tags', icon: Tags },
];

export function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-primary/15 text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

interface RowProps {
  item: QuickFindItem;
  query: string;
  projectTitle: (id: string) => string | undefined;
  areaTitle: (id: string) => string | undefined;
}

export function QuickFindRow({ item, query, projectTitle, areaTitle }: RowProps) {
  const { t } = useTranslation();
  switch (item.kind) {
    case 'list': {
      const nav = LIST_TARGETS.find((target) => target.to === item.target.to)!;
      const Icon = nav.icon;
      return (
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4 shrink-0', nav.colorClass ?? 'text-muted-foreground')} />
          <span className="truncate">
            <Highlighted text={item.target.names[0]} query={query} />
          </span>
        </div>
      );
    }
    case 'area':
      return (
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-semibold">
            <Highlighted text={item.area.title || t('area:newItemPlaceholder')} query={query} />
          </span>
        </div>
      );
    case 'project':
      return (
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <ProjectProgressPie
              total={item.project.taskTotalCount}
              completed={item.project.taskCompletedCount}
              projectStatus={item.project.status}
              size={16}
            />
          </span>
          <span
            className={cn(
              'flex-1 truncate',
              (item.project.status !== ProjectStatus.ACTIVE || item.project.trashedAt) &&
                'text-muted-foreground',
            )}
          >
            <Highlighted
              text={item.project.title || t('project:newItemPlaceholder')}
              query={query}
            />
          </span>
          {item.project.areaId && (
            <span className="shrink-0 truncate text-meta text-muted-foreground">
              {areaTitle(item.project.areaId)}
            </span>
          )}
          {item.project.trashedAt && <TrashedMark />}
        </div>
      );
    case 'heading':
      return (
        <div className="flex items-center gap-2">
          <Heading className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1 truncate">
            <Highlighted
              text={item.heading.title || t('project:headingPlaceholder')}
              query={query}
            />
          </span>
          <span className="max-w-[40%] shrink-0 truncate text-meta text-muted-foreground">
            {item.project.title || t('project:newItemPlaceholder')}
          </span>
        </div>
      );
    case 'tag':
      return (
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            <Highlighted text={item.tag.title} query={query} />
          </span>
        </div>
      );
    case 'task': {
      const { task, matchedSubtasks } = item.hit;
      const parent =
        (task.projectId && projectTitle(task.projectId)) ||
        (task.areaId && areaTitle(task.areaId)) ||
        null;
      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <TaskStatusGlyph status={task.status} />
            <span
              className={cn(
                'flex-1 truncate',
                (task.status !== TaskStatus.ACTIVE || task.trashedAt) && 'text-muted-foreground',
              )}
            >
              <Highlighted text={task.title || t('task:newTaskPlaceholder')} query={query} />
            </span>
            {parent && (
              <span className="max-w-[40%] shrink-0 truncate text-meta text-muted-foreground">
                {parent}
              </span>
            )}
            {task.trashedAt && <TrashedMark />}
          </div>
          {matchedSubtasks.map((subtask) => (
            <div
              key={subtask.id}
              className="flex items-center gap-1.5 pl-6 text-meta text-muted-foreground"
            >
              <CornerDownRight className="h-3 w-3 shrink-0" />
              <span className="truncate">
                <Highlighted text={subtask.title} query={query} />
              </span>
            </div>
          ))}
        </div>
      );
    }
  }
}

function TrashedMark() {
  const { t } = useTranslation();
  return (
    <Trash2
      role="img"
      aria-label={t('search:inTrash')}
      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
    />
  );
}

/** 任务状态的静态图形（外观同 TaskCheckbox，不可交互）。 */
function TaskStatusGlyph({ status }: { status: TaskStatus }) {
  const settled = status !== TaskStatus.ACTIVE;
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border-[1.5px]',
        settled
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/50 bg-background',
      )}
    >
      {status === TaskStatus.CANCELLED && <X className="h-2.5 w-2.5" strokeWidth={3.5} />}
      {status === TaskStatus.COMPLETED && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
          <path
            d="M2.5 6.2 5 8.5 9.5 3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
