import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { ProjectHeadingsService } from '../src/project-headings/project-headings.service';

describe('ProjectHeadingsService — convertToProject', () => {
  let service: ProjectHeadingsService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  const userId = 'user-1';
  const headingId = 'heading-1';

  const headingRow = {
    id: headingId,
    title: 'Build',
    sortOrder: 0,
    userId,
    projectId: 'project-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    project: { areaId: 'area-1' },
  };

  beforeEach(() => {
    mockPrisma = {
      project: {
        findFirst: vi.fn(),
        aggregate: vi.fn(),
        create: vi.fn(),
      },
      projectHeading: {
        findFirst: vi.fn(),
        deleteMany: vi.fn(),
      },
      task: {
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(
        async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma),
      ),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new ProjectHeadingsService(mockPrisma);
  });

  it('throws NotFoundException when the heading does not exist', async () => {
    mockPrisma.projectHeading.findFirst.mockResolvedValue(null);

    await expect(service.convertToProject(userId, 'nonexistent')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.project.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the owning project is missing or trashed', async () => {
    mockPrisma.projectHeading.findFirst.mockResolvedValue(headingRow);
    mockPrisma.project.findFirst.mockResolvedValue(null);

    await expect(service.convertToProject(userId, headingId)).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.project.create).not.toHaveBeenCalled();
  });

  it('creates the new project with the heading title, inherited areaId, and next sortOrder', async () => {
    mockPrisma.projectHeading.findFirst.mockResolvedValue(headingRow);
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'project-1' });
    mockPrisma.project.aggregate.mockResolvedValue({ _max: { sortOrder: 5 } });
    mockPrisma.project.create.mockResolvedValue({
      id: 'proj-new',
      title: 'Build',
      areaId: 'area-1',
      sortOrder: 6,
      userId,
    });
    mockPrisma.task.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.projectHeading.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.convertToProject(userId, headingId);

    expect(mockPrisma.project.aggregate).toHaveBeenCalledWith({
      where: { userId },
      _max: { sortOrder: true },
    });
    expect(mockPrisma.project.create).toHaveBeenCalledWith({
      data: {
        title: 'Build',
        areaId: 'area-1',
        sortOrder: 6,
        userId,
      },
    });

    // Every task under the heading moves to the new project, heading cleared.
    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
      where: { userId, headingId },
      data: { projectId: 'proj-new', headingId: null },
    });

    expect(mockPrisma.projectHeading.deleteMany).toHaveBeenCalledWith({
      where: { id: headingId, userId, projectId: 'project-1' },
    });
    expect(result).toEqual(
      expect.objectContaining({ id: 'proj-new', title: 'Build', tags: [] }),
    );
  });

  it('falls back to null areaId when the source project has no area', async () => {
    mockPrisma.projectHeading.findFirst.mockResolvedValue({
      ...headingRow,
      project: { areaId: null },
    });
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'project-1' });
    mockPrisma.project.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    mockPrisma.project.create.mockResolvedValue({
      id: 'proj-new',
      title: 'Build',
      areaId: null,
      sortOrder: 0,
      userId,
    });
    mockPrisma.task.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.projectHeading.deleteMany.mockResolvedValue({ count: 1 });

    await service.convertToProject(userId, headingId);

    expect(mockPrisma.project.create).toHaveBeenCalledWith({
      data: {
        title: 'Build',
        areaId: null,
        sortOrder: 0,
        userId,
      },
    });
  });

  it('converts an empty heading into an empty project', async () => {
    mockPrisma.projectHeading.findFirst.mockResolvedValue(headingRow);
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'project-1' });
    mockPrisma.project.aggregate.mockResolvedValue({ _max: { sortOrder: 5 } });
    mockPrisma.project.create.mockResolvedValue({
      id: 'proj-new',
      title: 'Build',
      areaId: 'area-1',
      sortOrder: 6,
      userId,
    });
    mockPrisma.task.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.projectHeading.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.convertToProject(userId, headingId);

    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
      where: { userId, headingId },
      data: { projectId: 'proj-new', headingId: null },
    });
    expect(mockPrisma.projectHeading.deleteMany).toHaveBeenCalled();
    expect(result.tags).toEqual([]);
  });

  it('throws BadRequestException when the heading disappears before deletion', async () => {
    mockPrisma.projectHeading.findFirst.mockResolvedValue(headingRow);
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'project-1' });
    mockPrisma.project.aggregate.mockResolvedValue({ _max: { sortOrder: 5 } });
    mockPrisma.project.create.mockResolvedValue({
      id: 'proj-new',
      title: 'Build',
      areaId: 'area-1',
      sortOrder: 6,
      userId,
    });
    mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.projectHeading.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.convertToProject(userId, headingId)).rejects.toThrow(
      BadRequestException,
    );
  });
});
