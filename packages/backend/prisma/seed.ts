import { PrismaClient, TaskBucket, TaskStatus, ScheduledType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      passwordHash,
    },
  });

  const area = await prisma.area.create({
    data: {
      title: 'Work',
      notes: 'Work-related tasks',
      userId: user.id,
    },
  });

  const project = await prisma.project.create({
    data: {
      title: 'Taskora',
      notes: 'Build the Taskora app',
      areaId: area.id,
      userId: user.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Set up backend',
      bucket: TaskBucket.INBOX,
      status: TaskStatus.ACTIVE,
      userId: user.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Implement frontend',
      bucket: TaskBucket.ANYTIME,
      status: TaskStatus.ACTIVE,
      projectId: project.id,
      userId: user.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Design database schema',
      bucket: TaskBucket.SCHEDULED,
      scheduledType: ScheduledType.SOMEDAY,
      status: TaskStatus.ACTIVE,
      userId: user.id,
    },
  });

  console.log('Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });