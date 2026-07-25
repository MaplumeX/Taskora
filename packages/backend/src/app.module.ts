import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import { ProjectsModule } from './projects/projects.module';
import { AreasModule } from './areas/areas.module';
import { TagsModule } from './tags/tags.module';
import { TagGroupsModule } from './tag-groups/tag-groups.module';

@Module({
  imports: [PrismaModule, AuthModule, TasksModule, ProjectsModule, AreasModule, TagsModule, TagGroupsModule],
})
export class AppModule {}