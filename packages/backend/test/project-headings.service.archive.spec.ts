import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { ProjectHeadingsService } from '../src/project-headings/project-headings.service';

describe('ProjectHeadingsService — archive / unarchive', () => {
  let service: ProjectHeadingsService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  const userId = 'user-1';
  const headingId = 'heading-1';
  const projectId = 'project-1';

  beforeEach(() => {
    mockPrisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: projectId }),
      },
      projectHeading: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
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

  /* ----------------------------- findAll filtering ----------------------------- */

  it('findAll filters to ACTIVE by default', async () => {
    mockPrisma.projectHeading.findMany.mockResolvedValue([]);

    await service.findAll(userId, projectId);

    expect(mockPrisma.projectHeading.findMany).toHaveBeenCalledWith({
      where: { userId, projectId, status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('findAll returns all headings when includeArchived is true', async () => {
    mockPrisma.projectHeading.findMany.mockResolvedValue([]);

    await service.findAll(userId, projectId, true);

    expect(mockPrisma.projectHeading.findMany).toHaveBeenCalledWith({
      where: { userId, projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });

  /* --------------------------------- archive --------------------------------- */

  it('throws NotFoundException when archiving a non-existent heading', async () => {
    mockPrisma.projectHeading.findFirst.mockResolvedValue(null);

    await expect(service.archive(userId, 'nonexistent')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.task.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.projectHeading.updateMany).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the owning project is missing', async () => {
    mockPrisma.projectHeading.findFirst.mockResolvedValue({
      id: headingId,
      projectId,
    });
    mockPrisma.project.findFirst.mockResolvedValue(null);

    await expect(service.archive(userId, headingId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('completes all ACTIVE tasks and marks the heading COMPLETED', async () => {
    const archivedHeading = {
      id: headingId,
      projectId,
      status: 'COMPLETED',
      completedAt: expect.any(Date),
    };
    mockPrisma.projectHeading.findFirst
      .mockResolvedValueOnce({ id: headingId, projectId })
      .mockResolvedValueOnce(archivedHeading);
    mockPrisma.task.updateMany.mockResolvedValue({ count: 3 });
    mockPrisma.projectHeading.updateMany.mockResolvedValue({ count: 1 });

    await service.archive(userId, headingId);

    // ACTIVE tasks under the heading are completed
    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        userId,
        headingId,
        status: 'ACTIVE',
        trashedAt: null,
      },
      data: {
        status: 'COMPLETED',
        completedAt: expect.any(Date),
      },
    });

    // Heading itself is marked COMPLETED
    expect(mockPrisma.projectHeading.updateMany).toHaveBeenCalledWith({
      where: { id: headingId, userId, projectId },
      data: {
        status: 'COMPLETED',
        completedAt: expect.any(Date),
      },
    });
  });

  it('rolls back when the heading disappears before the final write', async () => {
    mockPrisma.projectHeading.findFirst.mockResolvedValue({
      id: headingId,
      projectId,
    });
    mockPrisma.projectHeading.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.archive(userId, headingId)).rejects.toThrow(
      BadRequestException,
    );
  });

  /* -------------------------------- unarchive -------------------------------- */

  it('throws NotFoundException when unarchiving a non-existent heading', async () => {
    mockPrisma.projectHeading.findFirst.mockResolvedValue(null);

    await expect(service.unarchive(userId, 'nonexistent')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('marks the heading ACTIVE and does not touch any tasks', async () => {
    const unarchivedHeading = {
      id: headingId,
      projectId,
      status: 'ACTIVE',
      completedAt: null,
    };
    mockPrisma.projectHeading.findFirst
      .mockResolvedValueOnce({ id: headingId, projectId })
      .mockResolvedValueOnce(unarchivedHeading);
    mockPrisma.projectHeading.updateMany.mockResolvedValue({ count: 1 });

    await service.unarchive(userId, headingId);

    expect(mockPrisma.projectHeading.updateMany).toHaveBeenCalledWith({
      where: { id: headingId, userId, projectId },
      data: {
        status: 'ACTIVE',
        completedAt: null,
      },
    });

    // Tasks must NOT be touched during unarchive
    expect(mockPrisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back unarchive when the heading disappears before the final write', async () => {
    mockPrisma.projectHeading.findFirst.mockResolvedValue({
      id: headingId,
      projectId,
    });
    mockPrisma.projectHeading.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.unarchive(userId, headingId)).rejects.toThrow(
      BadRequestException,
    );
  });
});