import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { ProjectsModule } from '../projects/projects.module';
import { AreasModule } from '../areas/areas.module';
import { TagsModule } from '../tags/tags.module';
import { TagGroupsModule } from '../tag-groups/tag-groups.module';
import { SubtasksModule } from '../subtasks/subtasks.module';
import { FeedModule } from '../feed/feed.module';
import { ProjectHeadingsModule } from '../project-headings/project-headings.module';

import { AgentConfigController } from './byok/agent-config.controller';
import { AgentConfigService } from './byok/agent-config.service';
import { AgentToolsService } from './tools/agent-tools';
import { AgentApprovalService } from './approvals/approval.service';
import { ConversationsService } from './conversations.service';
import { AgentConversationsController } from './agent.controller';
import { AgentEventHub } from './runtime/agent-event-hub';
import { AgentRuntimeService } from './runtime/agent-runtime.service';

/**
 * Conversational Assistant (see ADR 0003). The Agent runtime is
 * pi-agent-core based, runs in-process, tools reuse the existing services
 * scoped by userId, LLM access is BYOK.
 */
@Module({
  imports: [
    PrismaModule,
    TasksModule,
    ProjectsModule,
    AreasModule,
    TagsModule,
    TagGroupsModule,
    SubtasksModule,
    FeedModule,
    ProjectHeadingsModule,
  ],
  controllers: [AgentConversationsController, AgentConfigController],
  providers: [
    AgentConfigService,
    AgentToolsService,
    AgentApprovalService,
    ConversationsService,
    AgentEventHub,
    AgentRuntimeService,
  ],
})
export class AgentModule {}
