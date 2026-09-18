import type { AreaResponseDto } from './area.dto';
import type { ProjectHeadingResponseDto } from './project-heading.dto';
import type { ProjectResponseDto } from './project.dto';
import type { SubtaskResponseDto } from './subtask.dto';
import type { TagGroupResponseDto } from './tag-group.dto';
import type { TagResponseDto } from './tag.dto';
import type { TaskResponseDto } from './task.dto';

/**
 * Change Event / Event Stream types (ADR 0005, tier-1 push sync).
 *
 * A Change Event is emitted for every Prisma write on a covered entity.
 * Payloads use the entity's list-DTO shape so clients can write them
 * straight into their React Query caches; deletes carry only the id.
 */

/** Entities that emit Change Events. Feed (derived view) and users do not. */
export type ChangeEntity =
  'task' | 'subtask' | 'project' | 'project-heading' | 'area' | 'tag' | 'tag-group';

/** Actions are deliberately dumb: view semantics stay in entity fields. */
export type ChangeAction = 'created' | 'updated' | 'deleted';

/** Payload type per entity (list-DTO shape; no subtasks nested in tasks). */
export interface ChangeEventPayloadMap {
  task: TaskResponseDto;
  subtask: SubtaskResponseDto;
  project: ProjectResponseDto;
  'project-heading': ProjectHeadingResponseDto;
  area: AreaResponseDto;
  tag: TagResponseDto;
  'tag-group': TagGroupResponseDto;
}

/** One Change Event on a user's Event Stream. `seq` is per-user, monotonic. */
export interface ChangeEventBase {
  seq: number;
  action: ChangeAction;
  id: string;
}

/** Discriminated per entity so consumers narrow `data` by `entity`. */
export type ChangeEvent = ChangeEventBase &
  {
    [E in ChangeEntity]: {
      entity: E;
      /** Full entity for created/updated; absent for deleted. */
      data?: ChangeEventPayloadMap[E];
    };
  }[ChangeEntity];

/**
 * Frames on the Event Stream (`GET /events`, SSE).
 *
 * - `hello`: sent on connect, carries the latest seq for the user.
 * - `change`: one Change Event.
 * - `resync`: the server cannot replay what the client missed (gap beyond
 *   the ring buffer, or a seq jump after restart) — client must refetch all.
 */
export type EventStreamFrame =
  { type: 'hello'; seq: number } | { type: 'change'; event: ChangeEvent } | { type: 'resync' };
