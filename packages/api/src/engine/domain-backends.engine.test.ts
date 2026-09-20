/**
 * 每域 backend seam 级测试（spec「Testing Decisions」）：断言 Engine 实现
 * 与 REST 实现的语义对齐（bucket 解析、视图过滤、终态/恢复语义、排序、
 * 删除原语的引用清理），仿 task-backend.engine.test.ts 先例。
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { InMemorySyncHub, openEngine, type Engine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import {
  HeadingStatus,
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskStatus,
} from '@taskora/shared';

import { createEngineProjectBackend } from './project-backend.engine';
import { createEngineAreaBackend } from './area-backend.engine';
import { createEngineTagBackend } from './tag-backend.engine';
import { createEngineTagGroupBackend } from './tag-group-backend.engine';
import { createEngineProjectHeadingBackend } from './project-heading-backend.engine';

const USER = 'user-1';

describe('每域 Engine backends（V2：全实体离线）', () => {
  let engine: Engine;
  let projects: ReturnType<typeof createEngineProjectBackend>;
  let areas: ReturnType<typeof createEngineAreaBackend>;
  let tags: ReturnType<typeof createEngineTagBackend>;
  let tagGroups: ReturnType<typeof createEngineTagGroupBackend>;
  let headings: ReturnType<typeof createEngineProjectHeadingBackend>;

  beforeEach(async () => {
    const storage = await createNodeSqliteStorage(':memory:');
    const hub = new InMemorySyncHub();
    engine = await openEngine({
      storage,
      deviceId: 'dev-test',
      transport: hub.transportFor(USER),
    });
    projects = createEngineProjectBackend({ engine });
    areas = createEngineAreaBackend({ engine });
    tags = createEngineTagBackend({ engine });
    tagGroups = createEngineTagGroupBackend({ engine });
    headings = createEngineProjectHeadingBackend({ engine });
  });

  it('Project：create bucket 解析（DATE→SCHEDULED、无归属→ANYTIME），计数本地计算', async () => {
    const p1 = await projects.createProject({ title: '普通项目' });
    expect(p1.bucket).toBe(ProjectBucket.ANYTIME);
    expect(p1.status).toBe(ProjectStatus.ACTIVE);
    expect(p1.taskTotalCount).toBe(0);

    const dated = await projects.createProject({
      title: '日程项目',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-01-02',
    });
    expect(dated.bucket).toBe(ProjectBucket.SCHEDULED);

    // 计数口径：非 trashed task 总数 / 已了结数
    const projectId = p1.id;
    await engine.create('task', {
      title: 't1',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      projectId,
      trashedAt: null,
      settledAt: null,
    });
    await engine.create('task', {
      title: 't2',
      status: 'COMPLETED',
      bucket: 'ANYTIME',
      projectId,
      trashedAt: null,
      settledAt: '2026-01-01T00:00:00.000Z',
    });
    await engine.create('task', {
      title: 'trashed',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      projectId,
      trashedAt: '2026-01-01T00:00:00.000Z',
      settledAt: null,
    });
    const detail = await projects.getProject(projectId);
    expect(detail.taskTotalCount).toBe(2);
    expect(detail.taskCompletedCount).toBe(1);
  });

  it('Project：软删级联（project + 下属 task 一起进 Trash）、恢复一并捡回', async () => {
    const project = await projects.createProject({ title: '要删的项目' });
    const taskId = await engine.create('task', {
      title: '下属任务',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      projectId: project.id,
      trashedAt: null,
      settledAt: null,
    });

    await projects.deleteProject(project.id);
    expect((await projects.getProjects()).map((p) => p.title)).toEqual([]);
    expect((await engine.get('task', taskId))?.fields.trashedAt).not.toBeNull();

    await projects.restoreProject(project.id);
    expect((await projects.getProjects()).map((p) => p.title)).toEqual(['要删的项目']);
    expect((await engine.get('task', taskId))?.fields.trashedAt).toBeNull();
  });

  it('Project：完成/重开语义与拖拽重排（Position 生效）', async () => {
    const a = await projects.createProject({ title: 'A' });
    const b = await projects.createProject({ title: 'B' });
    const c = await projects.createProject({ title: 'C' });
    expect((await projects.getProjects()).map((p) => p.title)).toEqual(['A', 'B', 'C']);

    const completed = await projects.completeProject(a.id);
    expect(completed.status).toBe(ProjectStatus.COMPLETED);
    expect(completed.completedAt).not.toBeNull();

    const reopened = await projects.uncompleteProject(a.id);
    expect(reopened.status).toBe(ProjectStatus.ACTIVE);
    expect(reopened.completedAt).toBeNull();

    await projects.reorderProjects([c.id, a.id, b.id]);
    expect((await projects.getProjects()).map((p) => p.title)).toEqual(['C', 'A', 'B']);
  });

  it('Area：增删改 + 重排；物理删除清理 Task/Project 的 areaId 引用（SetNull 语义）', async () => {
    const area = await areas.createArea({ title: '工作' });
    const moved = await areas.createArea({ title: '生活' });
    expect((await areas.getAreas()).map((a) => a.title)).toEqual(['工作', '生活']);

    await areas.updateArea(area.id, { notes: '九到六' });
    expect((await areas.getArea(area.id)).notes).toBe('九到六');

    await areas.reorderAreas([moved.id, area.id]);
    expect((await areas.getAreas()).map((a) => a.title)).toEqual(['生活', '工作']);

    const projectId = await engine.create('project', {
      title: 'P',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      scheduledType: 'NONE',
      areaId: area.id,
    });
    const taskId = await engine.create('task', {
      title: 'T',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      areaId: area.id,
      trashedAt: null,
      settledAt: null,
    });
    await areas.deleteArea(area.id);
    expect(await engine.get('area', area.id)).toBeNull();
    expect((await engine.get('task', taskId))?.fields.areaId).toBeNull();
    expect((await engine.get('project', projectId))?.fields.areaId).toBeNull();
  });

  it('Tag / TagGroup：增删改；删分组后成员 Tag 的 tagGroupId 置空（SetNull 语义）', async () => {
    const group = await tagGroups.createTagGroup({ title: '语境' });
    const urgent = await tags.createTag({ title: '紧急', color: '#FF0000', tagGroupId: group.id });
    expect(urgent.color).toBe('#FF0000');
    expect((await tagGroups.getTagGroup(group.id)).tags.map((t) => t.title)).toEqual(['紧急']);

    await tags.updateTag(urgent.id, { color: '#00FF00' });
    expect((await tags.getTag(urgent.id)).color).toBe('#00FF00');

    await tagGroups.updateTagGroup(group.id, { title: '场景' });
    expect((await tagGroups.getTagGroup(group.id)).title).toBe('场景');

    await tagGroups.deleteTagGroup(group.id);
    expect(await engine.get('tag-group', group.id)).toBeNull();
    expect((await engine.get('tag', urgent.id))?.fields.tagGroupId).toBeNull();

    await tags.deleteTag(urgent.id);
    expect(await engine.get('tag', urgent.id)).toBeNull();
  });

  it('ProjectHeading：增改/归档/取消归档；删除软删下属 tasks 并物理删 heading', async () => {
    const project = await projects.createProject({ title: '项目' });
    const h1 = await headings.createProjectHeading({ projectId: project.id, title: '阶段一' });
    const h2 = await headings.createProjectHeading({ projectId: project.id, title: '阶段二' });
    expect(h1.sortOrder).toBe(0);
    expect(h2.sortOrder).toBe(1);

    // 非本项目的 heading 查询校验归属（404 同语义）
    await expect(headings.getProjectHeadings('no-such-project')).rejects.toThrow();

    await headings.updateProjectHeading(h1.id, { title: '筹备' });
    expect((await headings.getProjectHeadings(project.id)).map((h) => h.title)).toEqual([
      '筹备',
      '阶段二',
    ]);

    // 归档：完成其下 ACTIVE tasks + heading 终态
    const taskId = await engine.create('task', {
      title: '归档目标',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      projectId: project.id,
      trashedAt: null,
      settledAt: null,
    });
    await engine.update('task', taskId, { headingId: h1.id });
    const archived = await headings.archiveProjectHeading(h1.id);
    expect(archived.status).toBe(HeadingStatus.COMPLETED);
    expect((await engine.get('task', taskId))?.fields.status).toBe(TaskStatus.COMPLETED);
    expect((await headings.getProjectHeadings(project.id)).map((h) => h.title)).toEqual(['阶段二']);
    expect(
      (await headings.getProjectHeadings(project.id, { includeArchived: true })).map(
        (h) => h.title,
      ),
    ).toEqual(['筹备', '阶段二']);

    await headings.unarchiveProjectHeading(h1.id);
    expect((await headings.getProjectHeadings(project.id)).map((h) => h.title)).toEqual([
      '筹备',
      '阶段二',
    ]);

    // 删除：软删下属直接 tasks，heading 物理消失
    await headings.deleteProjectHeading(h2.id);
    expect(await engine.get('project-heading', h2.id)).toBeNull();
  });

  it('Heading convert：新 Project 继承源 Project 的 areaId，tasks 移入新 Project', async () => {
    const areaId = await engine.create('area', { title: 'A', notes: null, tagIds: [] });
    const project = await projects.createProject({ title: '源项目', areaId });
    const heading = await headings.createProjectHeading({ projectId: project.id, title: '子方向' });
    const taskId = await engine.create('task', {
      title: '搬走的任务',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      projectId: project.id,
      trashedAt: null,
      settledAt: null,
    });
    await engine.update('task', taskId, { headingId: heading.id });

    const newProject = await headings.convertProjectHeadingToProject(heading.id);
    expect(newProject.title).toBe('子方向');
    expect(newProject.areaId).toBe(areaId);
    const task = await engine.get('task', taskId);
    expect(task?.fields.projectId).toBe(newProject.id);
    expect(task?.fields.headingId).toBeNull();
    expect(await engine.get('project-heading', heading.id)).toBeNull();
  });

  it('断网全功能 + 恢复联网收敛：两台设备经同一 hub 达到一致', async () => {
    const hub = new InMemorySyncHub();
    const open = async (name: string) =>
      openEngine({
        storage: await createNodeSqliteStorage(':memory:'),
        deviceId: name,
        transport: hub.transportFor(USER),
      });
    const a = await open('dev-a');
    const b = await open('dev-b');
    const projectsA = createEngineProjectBackend({ engine: a });
    const areasA = createEngineAreaBackend({ engine: a });
    const tagsA = createEngineTagBackend({ engine: a });
    const projectsB = createEngineProjectBackend({ engine: b });
    const areasB = createEngineAreaBackend({ engine: b });
    const tagsB = createEngineTagBackend({ engine: b });

    // 断网（transport 拔线由 flush 失败体现：直接不 sync 就是离线写）
    const area = await areasA.createArea({ title: '领域' });
    const tag = await tagsA.createTag({ title: '标签' });
    const project = await projectsA.createProject({
      title: '项目',
      areaId: area.id,
      tagIds: [tag.id],
    });
    await projectsA.updateProject(project.id, { notes: '离线备注' });
    await projectsA.completeProject(project.id);

    await a.sync();
    await b.sync();

    // 收敛：B 读到同样的领域/标签/项目（含完成终态与标签解析）
    expect((await areasB.getAreas()).map((x) => x.title)).toEqual(['领域']);
    expect((await tagsB.getTags()).map((x) => x.title)).toEqual(['标签']);
    const seen = await projectsB.getProject(project.id);
    expect(seen.title).toBe('项目');
    expect(seen.notes).toBe('离线备注');
    expect(seen.status).toBe(ProjectStatus.COMPLETED);
    expect(seen.areaId).toBe(area.id);
    expect(seen.tags?.map((t) => t.id)).toEqual([tag.id]);

    // B 离线重排并同步回去，A 收敛
    await projectsA.createProject({ title: '第二个' });
    await a.sync();
    await b.sync();
    const all = await projectsB.getProjects();
    await projectsB.reorderProjects([...all.map((p) => p.id)].reverse());
    await b.sync();
    await a.sync();
    expect((await projectsA.getProjects()).map((p) => p.title)).toEqual(
      (await projectsB.getProjects()).map((p) => p.title),
    );
    expect((await projectsA.getProjects()).map((p) => p.title)).toEqual(['第二个', '项目']);
    await a.close();
    await b.close();
  });
});
