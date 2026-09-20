import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { ProjectsModule } from './projects/projects.module';
import { AreasModule } from './areas/areas.module';
import { TagsModule } from './tags/tags.module';
import { TagGroupsModule } from './tag-groups/tag-groups.module';
import { FeedModule } from './feed/feed.module';
import { ProjectHeadingsModule } from './project-headings/project-headings.module';
import { SubtasksModule } from './subtasks/subtasks.module';
import { AgentModule } from './agent/agent.module';
import { SyncModule } from './sync/sync.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    PrismaModule,
    EventsModule,
    AuthModule,
    UsersModule,
    TasksModule,
    ProjectsModule,
    AreasModule,
    TagsModule,
    TagGroupsModule,
    FeedModule,
    ProjectHeadingsModule,
    SubtasksModule,
    AgentModule,
    SyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
