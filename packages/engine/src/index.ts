export { HybridClock, compareHlc, formatHlc, hlcWallMs, parseHlc, type HlcParts } from './hlc';
export {
  BASE_62_DIGITS,
  positionBetween,
  positionsBetween,
  rebalancePositions,
  validatePosition,
} from './position';
export {
  mergeEntityState,
  mergeFieldWrites,
  type EntityMergeState,
  type FieldClocks,
  type FieldWrite,
  type MergeOutcome,
} from './merger';
export {
  ENTITIES,
  SYNC_ENTITIES,
  entityDef,
  isSyncEntity,
  schemaDdl,
  DELETE_CASCADES,
  COMPACT_NULL_REFS,
  type EntityDef,
  type FieldDef,
  type SyncEntity,
  type WireRow,
} from './entities';
export type { SqlRow, SqlStorage } from './storage';
export { inTransaction } from './storage';
export {
  LocalReplica,
  type ReplicaRow,
  type LocalReplicaOptions,
  type OutboxEntry,
} from './replica';
export { openEngine, positionAfter, type Engine, type EngineOptions } from './engine';
export type {
  BootstrapResponse,
  CompactChange,
  DeleteRequest,
  EntityChange,
  HubChange,
  OutboxEvent,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SnapshotEntry,
  SyncTransport,
} from './protocol';
export { InMemorySyncHub, type InMemorySyncHubOptions } from './hub';
