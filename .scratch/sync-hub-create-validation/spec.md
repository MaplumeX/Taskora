# Bug: Today 创建的任务同步后落入 Inbox(v0.4.2)

Status: resolved

## 症状

用户在桌面端 Today 视图创建任务,本地显示正常;一次 sync(flush + pull)之后,
任务被合并成 `bucket=INBOX / scheduledType=NONE`,落入 Inbox 视图。

## 根因(两个叠加,全在 hub 侧 `applyEvent` 的 create 路径)

设备端的完整 create 事件(LocalReplica.createInternal 携带全部 17 个字段)
在 hub 上被 **Prisma 静默拒掉**(push 的 try/catch 吞掉、照常 ack):

1. **tagIds 物化携带 `deleteMany`**(`toPrismaData`):Prisma 的 create 嵌套
   输入(`*CreateNestedManyWithout*`)不接受 `deleteMany`;
2. **`sortOrder: null` 透传**:引擎注册表字段一律可空,而 Prisma 侧
   `sortOrder Int @default(0)` 不可空,unchecked create 校验失败。

两条都会让 Prisma 把整份数据按 **checked 输入**(`TaskCreateInput`,要求
`user: { connect }`、拒绝裸 `userId`)去校验,报出的错误是极具迷惑性的
`Argument "user" is missing`。

之后用户在新行输入标题 → `updateTask(title)` 部分字段事件(不含 tagIds、
不含 sortOrder)落在不存在的行上,被 `applyEvent` 当成 **create 建行**:
`bucket`/`scheduledType` 吃 Prisma 列默认值 `INBOX`/`NONE`。该默认值行以
`row.updatedAt = max(clock)+1` 的基线时钟(晚于设备自己的 create 时钟)
广播回设备,字段级 LWW 裁决把设备上真实的 `DATE/SCHEDULED` 值**压掉**——
任务于是「同步后变到 Inbox」。

现有 sync-hub 单测全部 mock Prisma,无法暴露校验层问题。

## 修复

- `entity-codec.ts`:
  - `toPrismaData` 增加 `mode: 'create' | 'update'`(默认 update):
    create 路径 tagIds 物化为纯 `{ create }`,不再带 `deleteMany`;
  - 新增 DMMF 派生的 `NON_NULLABLE_COLUMNS`:不可空列的 null 值一律剔除,
    交给 Prisma 列默认值;
- `sync-hub.service.ts`:`applyEvent` 按行是否存在传 create/update 模式;
- 回归测试:
  - `test/sync.entity-codec.spec.ts`:create 模式形状 + null 剔除(单测);
  - `test/sync.hub-device-roundtrip.e2e-spec.ts`(真实 Postgres,
    `TEST_DATABASE_URL` 未设时 skip):固化「Today 全字段 create → 后续
    title 编辑 → pull 合并后仍在 Today」的完整往返。

## Comments

- 2026-09-20 复现与修复:用运行中的本地 Postgres 建独立库,以真实
  `SyncHubService` + 真实 Prisma + 真实合并器(`mergeEntityState`)完整
  重放了症状(修复前设备合并态 `bucket=INBOX / scheduledType=NONE`),
  修复后同一场景回归通过。
- 存量脏数据:修复不追溯。hub 上已损坏的行(bucket=INBOX、
  scheduledType=NONE)需要用户手动重新设定日期;修复后这样的字段写会
  正常合并并按 LWW 生效。
