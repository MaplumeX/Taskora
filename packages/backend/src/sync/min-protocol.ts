// 独立成文件：/health 也回报它（ADR-0026），不应为此加载同步模块与 Prisma。

/**
 * hub 仍接受的最低同步协议版本（ADR-0007「协议版本」）。只在旧客户端会把
 * 数据写坏或无法理解 hub 下发的内容时才提高它。
 *
 * 4（retire-sort-order）：协议 3 及更早的客户端只按 sortOrder 排 Area /
 * ProjectHeading / TagGroup / Subtask，重排也只写 sortOrder——hub 不再认识
 * 这个字段，它们的重排会被永久拒在 Outbox 里、在其他设备上静默丢失。
 *
 * 5（嵌套 Tag，ADR-0016）：协议 4 的客户端还会写 tag-group 实体与 Tag 的
 * tagGroupId 字段，hub 已不认识它们；这些写会被永久拒在 Outbox 里，Tag
 * 层级在其他设备上静默丢失。
 *
 * 7（Start，ADR 0024）：协议 6 的客户端还会写 Task / Project 的 bucket 与
 * scheduledType，hub 已不认识它们；这些写会被永久拒在 Outbox 里，计划与
 * Inbox / Someday 归属在其他设备上静默丢失。
 */
export const MIN_SYNC_PROTOCOL_VERSION = 7;
