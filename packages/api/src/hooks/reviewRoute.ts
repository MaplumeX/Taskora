/**
 * 回顾模式（`/review/project/:id`、`/review/area/:id`）里的当前对象按项目 /
 * 区域页处理：可以就地添加任务。
 */
export function reviewDetailOf(pathname: string): { view: 'projects' | 'areas'; id: string } | null {
  const match = /^\/review\/(project|area)\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  return { view: match[1] === 'project' ? 'projects' : 'areas', id: match[2] };
}
