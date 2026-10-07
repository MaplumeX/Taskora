import * as React from 'react';
import { ArrowRight, ChevronDown, FolderInput, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMatch, useNavigate } from 'react-router-dom';

import { useAreasQuery, useProjectQuery, useUpdateTask } from '@taskora/api';
import type { TaskResponseDto } from '@taskora/shared';
import { toast } from 'sonner';

import { FieldPicker } from '@/components/common/FieldPicker';
import { MenuRow } from '@/components/common/MenuRow';
import { ProjectProgressPie } from '@/components/project/ProjectProgressRing';
import { useIsDesktop } from '../../lib/use-media-query';
import { MovePicker } from './fields/MovePicker';

interface Props {
  current: TaskResponseDto;
}

/** 直接归属，不把 Bucket 当作位置；已经在所属项目/区域页面时不重复显示入口。 */
export function TaskPlacement({ current }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updateTask = useUpdateTask();
  const projectMatch = useMatch('/projects/:id');
  const areaMatch = useMatch('/areas/:id');
  const isOwnPage = current.projectId
    ? projectMatch?.params.id === current.projectId
    : !!current.areaId && areaMatch?.params.id === current.areaId;
  // 单独读项目详情：已进 Trash 的项目不在常规项目列表中，但仍是任务的归属。
  const { data: project } = useProjectQuery(current.projectId ?? '');
  const { data: areas = [] } = useAreasQuery();
  const area = current.projectId ? undefined : areas.find((item) => item.id === current.areaId);
  const isDesktop = useIsDesktop();
  const [open, setOpen] = React.useState(false);
  const [moving, setMoving] = React.useState(false);
  const moveRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOwnPage) setOpen(false);
  }, [isOwnPage]);

  // 内容由动作切换到移动选择器时，Popover 不会再次自动聚焦。
  // 触屏只聚焦容器，不主动弹出软键盘。
  React.useEffect(() => {
    if (!open || !moving) return;
    const target = isDesktop ? moveRef.current?.querySelector('input') : moveRef.current;
    target?.focus();
  }, [open, moving, isDesktop]);

  const parent = current.projectId ? project : area;
  if (!parent || isOwnPage) return null;
  const title =
    parent.title || t(project ? 'project:newItemPlaceholder' : 'area:newItemPlaceholder');
  const label = t('task:placement', { place: title });
  const route = project ? `/projects/${project.id}` : `/areas/${parent.id}`;

  return (
    <div
      className="ml-auto min-w-0 max-w-full pt-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Portal 中搜索框的 Escape 只关闭选择器，不能冒泡到 TaskItem 收起整行。
        if (e.key === 'Escape') e.stopPropagation();
      }}
    >
      <FieldPicker
        label={moving ? t('task:move') : label}
        open={open}
        popoverAlign="end"
        popoverClassName={moving ? undefined : 'w-44'}
        onOpenChange={(next) => {
          setOpen(next);
          // 关闭动画期间保留移动内容，避免关闭时闪回动作菜单。
          if (next) setMoving(false);
        }}
        trigger={
          <button
            type="button"
            aria-label={label}
            title={title}
            className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md px-2 text-meta text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-11"
          >
            {project ? (
              <span aria-hidden className="shrink-0">
                <ProjectProgressPie
                  total={project.taskTotalCount}
                  completed={project.taskCompletedCount}
                  projectStatus={project.status}
                  size={14}
                />
              </span>
            ) : (
              <Layers aria-hidden className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{title}</span>
            <ChevronDown aria-hidden className="h-3 w-3 shrink-0" />
          </button>
        }
      >
        {(close) =>
          moving ? (
            <div ref={moveRef} tabIndex={-1} className="outline-none">
              <MovePicker
                current={current}
                onSelect={(data) => {
                  updateTask.mutate(
                    { id: current.id, data },
                    { onError: () => toast.error(t('common:saveFailed')) },
                  );
                  close();
                }}
              />
            </div>
          ) : (
            <>
              <MenuRow
                icon={ArrowRight}
                onClick={() => {
                  close();
                  navigate(route);
                }}
              >
                {t(project ? 'task:placementGoToProject' : 'task:placementGoToArea')}
              </MenuRow>
              <MenuRow icon={FolderInput} onClick={() => setMoving(true)}>
                {t(project ? 'task:placementChangeProject' : 'task:placementChangeArea')}
              </MenuRow>
            </>
          )
        }
      </FieldPicker>
    </div>
  );
}
