import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProjectHeadingsService } from '../src/project-headings/project-headings.service';
import type { PrismaService } from '../src/prisma/prisma.service';

function createPrismaMock() {
  const prisma = {
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }),
    },
    projectHeading: {
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 2 } }),
      create: vi.fn().mockImplementation(({ data }) => ({
        id: 'heading-new',
        ...data,
      })),
      findMany: vi.fn().mockResolvedValue([{ id: 'heading-1' }, { id: 'heading-2' }]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'heading-1',
        projectId: 'project-1',
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    task: {
      findMany: vi.fn().mockResolvedValue([{ id: 'task-1' }, { id: 'task-2' }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  return prisma;
}

describe('ProjectHeadingsService', () => {
  it('appends a newly created heading after the current maximum order', async () => {
    const prisma = createPrismaMock();
    const service = new ProjectHeadingsService(prisma as unknown as PrismaService);

    await service.create('user-1', { projectId: 'project-1', title: '' });

    expect(prisma.projectHeading.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        projectId: 'project-1',
        title: '',
        sortOrder: 3,
      },
    });
  });

  it('scopes heading reads to an owned project (trashed allowed)', async () => {
    const prisma = createPrismaMock();
    const service = new ProjectHeadingsService(prisma as unknown as PrismaService);

    await service.findAll('user-1', 'project-1');

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'project-1', userId: 'user-1' },
      select: { id: true },
    });
    expect(prisma.projectHeading.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', projectId: 'project-1' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('rejects heading updates that are not owned by the user', async () => {
    const prisma = createPrismaMock();
    prisma.projectHeading.findFirst.mockResolvedValueOnce(null);
    const service = new ProjectHeadingsService(prisma as unknown as PrismaService);

    await expect(
      service.update('user-1', 'foreign-heading', { title: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.projectHeading.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'duplicate task IDs',
      ungroupedTaskIds: ['task-1', 'task-1'],
      groups: [
        { headingId: 'heading-1', taskIds: [] },
        { headingId: 'heading-2', taskIds: ['task-2'] },
      ],
    },
    {
      name: 'an omitted task ID',
      ungroupedTaskIds: ['task-1'],
      groups: [
        { headingId: 'heading-1', taskIds: [] },
        { headingId: 'heading-2', taskIds: [] },
      ],
    },
    {
      name: 'a foreign, cross-project, unknown, or child task ID',
      ungroupedTaskIds: ['task-1', 'task-2', 'invalid-task'],
      groups: [
        { headingId: 'heading-1', taskIds: [] },
        { headingId: 'heading-2', taskIds: [] },
      ],
    },
  ])('rejects $name in a complete layout', async ({ ungroupedTaskIds, groups }) => {
    const prisma = createPrismaMock();
    const service = new ProjectHeadingsService(prisma as unknown as PrismaService);

    await expect(
      service.reorder('user-1', {
        projectId: 'project-1',
        ungroupedTaskIds,
        groups,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    {
      name: 'duplicate heading IDs',
      groups: [
        { headingId: 'heading-1', taskIds: ['task-1'] },
        { headingId: 'heading-1', taskIds: ['task-2'] },
      ],
    },
    {
      name: 'an omitted heading ID',
      groups: [{ headingId: 'heading-1', taskIds: ['task-1', 'task-2'] }],
    },
    {
      name: 'a foreign or cross-project heading ID',
      groups: [
        { headingId: 'heading-1', taskIds: ['task-1'] },
        { headingId: 'heading-2', taskIds: ['task-2'] },
        { headingId: 'foreign-heading', taskIds: [] },
      ],
    },
  ])('rejects $name in a complete layout', async ({ groups }) => {
    const prisma = createPrismaMock();
    const service = new ProjectHeadingsService(prisma as unknown as PrismaService);

    await expect(
      service.reorder('user-1', {
        projectId: 'project-1',
        ungroupedTaskIds: [],
        groups,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists heading order, membership, and group-local task order together', async () => {
    const prisma = createPrismaMock();
    const service = new ProjectHeadingsService(prisma as unknown as PrismaService);

    await service.reorder('user-1', {
      projectId: 'project-1',
      ungroupedTaskIds: ['task-2'],
      groups: [
        { headingId: 'heading-2', taskIds: ['task-1'] },
        { headingId: 'heading-1', taskIds: [] },
      ],
    });

    expect(prisma.projectHeading.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'heading-2',
        userId: 'user-1',
        projectId: 'project-1',
      },
      data: { sortOrder: 0 },
    });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        userId: 'user-1',
        projectId: 'project-1',
        trashedAt: null,
        status: 'ACTIVE',
      },
      data: { headingId: 'heading-2', sortOrder: 0 },
    });
  });

  it('rolls back when a validated layout row changes before it is written', async () => {
    const prisma = createPrismaMock();
    prisma.task.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = new ProjectHeadingsService(prisma as unknown as PrismaService);

    await expect(
      service.reorder('user-1', {
        projectId: 'project-1',
        ungroupedTaskIds: ['task-1', 'task-2'],
        groups: [
          { headingId: 'heading-1', taskIds: [] },
          { headingId: 'heading-2', taskIds: [] },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes an empty heading without issuing a task update', async () => {
    const prisma = createPrismaMock();
    prisma.task.findMany.mockResolvedValue([]);
    const service = new ProjectHeadingsService(prisma as unknown as PrismaService);

    await service.remove('user-1', 'heading-1');

    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(prisma.projectHeading.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'heading-1',
        userId: 'user-1',
        projectId: 'project-1',
      },
    });
  });

  it('soft-deletes direct heading tasks without changing status', async () => {
    const prisma = createPrismaMock();
    prisma.projectHeading.findFirst.mockResolvedValue({
      id: 'heading-1',
      projectId: 'project-1',
    });
    prisma.task.findMany.mockResolvedValue([
      { id: 'root' },
      { id: 'child' },
    ]);
    const service = new ProjectHeadingsService(prisma as unknown as PrismaService);

    await service.remove('user-1', 'heading-1');

    const update = prisma.task.updateMany.mock.calls[0][0];
    expect(new Set(update.where.id.in)).toEqual(new Set(['root', 'child']));
    expect(Object.keys(update.data)).toEqual(['trashedAt']);
    expect(prisma.projectHeading.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'heading-1',
        userId: 'user-1',
        projectId: 'project-1',
      },
    });
  });
});
