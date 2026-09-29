export { HybridClock, compareHlc, formatHlc, hlcWallMs, parseHlc, type HlcParts } from './hlc';
export {
  normalizeRepeatRule,
  canonicalRepeatRule,
  nextOccurrenceDate,
  deriveRepeatInstanceId,
  deriveSubtaskId,
} from './repeat';
export {
  BASE_62_DIGITS,
  positionBetween,
  positionsBetween,
  MAX_POSITION_LENGTH,
  rebalancePositions,
  rebalanceSegments,
  repositionMinimal,
  synthPosition,
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
  REFERENCE_FIELDS,
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
  type ListOptions,
  type ListWhere,
  type ListWhereValue,
  type LocalReplicaOptions,
  type OutboxEntry,
  type EngineChange,
} from './replica';
export {
  MAX_PUSH_BATCH_BYTES,
  openEngine,
  positionAfter,
  type Engine,
  type EngineOptions,
} from './engine';
export {
  SYNC_CLIENT_HEADER,
  SYNC_PROTOCOL_HEADER,
  SYNC_PROTOCOL_VERSION,
  SyncUpgradeRequiredError,
  type BootstrapResponse,
  type CompactChange,
  type DeleteRequest,
  type EntityChange,
  type HubChange,
  type HubVersionInfo,
  type OutboxEvent,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type RejectedChange,
  type SnapshotEntry,
  type SyncTransport,
} from './protocol';
export {
  REPLICA_MIGRATIONS,
  REPLICA_SCHEMA_VERSION,
  ReplicaSchemaTooNewError,
  migrateReplica,
  readSchemaVersion,
  type ReplicaMigration,
} from './migrations';
export {
  InMemorySyncHub,
  applyRepairs,
  scrubReferences,
  VIRTUAL_DEVICE_ID,
  type InMemorySyncHubOptions,
  type ReferenceProbe,
  type ReferenceStatus,
} from './hub';
export { repairEntity, type HeadingProjectProbe } from './invariants';
export * from './domain';
