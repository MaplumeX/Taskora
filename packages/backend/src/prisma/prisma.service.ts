import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { ChangeEventCollector } from '../events/change-event.collector';

/**
 * Prisma access for the whole backend, wrapped around a client extended with
 * the Change Event interceptor (see src/events/).
 *
 * The class delegates every model to the *extended* client so that all
 * write paths — including those inside `$transaction` callbacks — produce
 * Change Events. `$transaction` is additionally wrapped so events collected
 * inside a transaction are only flushed after it commits.
 *
 * Reads used by the interceptor itself (payload refetches, pre-queries) run
 * against `base`, the unextended client, so they never re-enter the
 * interceptor.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly base = new PrismaClient();
  private readonly extended: PrismaClient;

  constructor(collector: ChangeEventCollector) {
    this.extended = this.base.$extends(
      collector.attach(this.base) as unknown as Parameters<PrismaClient['$extends']>[0],
    ) as unknown as PrismaClient;
    this.$transaction = ((arg: unknown, options: unknown) =>
      collector.transaction(() =>
        (this.extended.$transaction as (a: unknown, o: unknown) => Promise<unknown>)(arg, options),
      )) as unknown as PrismaService['$transaction'];
  }

  async onModuleInit() {
    await this.base.$connect();
  }

  async onModuleDestroy() {
    await this.base.$disconnect();
  }

  // Model delegates (extended client — writes emit Change Events).
  get user() {
    return this.extended.user;
  }
  get refreshToken() {
    return this.extended.refreshToken;
  }
  get area() {
    return this.extended.area;
  }
  get project() {
    return this.extended.project;
  }
  get projectHeading() {
    return this.extended.projectHeading;
  }
  get tagGroup() {
    return this.extended.tagGroup;
  }
  get tag() {
    return this.extended.tag;
  }
  get taskTag() {
    return this.extended.taskTag;
  }
  get projectTag() {
    return this.extended.projectTag;
  }
  get areaTag() {
    return this.extended.areaTag;
  }
  get task() {
    return this.extended.task;
  }
  get subtask() {
    return this.extended.subtask;
  }
  get agentConfig() {
    return this.extended.agentConfig;
  }
  get conversation() {
    return this.extended.conversation;
  }
  get conversationMessage() {
    return this.extended.conversationMessage;
  }
  get agentApproval() {
    return this.extended.agentApproval;
  }
  get device() {
    return this.extended.device;
  }
  get compactedEntity() {
    return this.extended.compactedEntity;
  }

  // Overridden in the constructor (wrapped with the collector's tx scope).
  declare $transaction: PrismaClient['$transaction'];
}
