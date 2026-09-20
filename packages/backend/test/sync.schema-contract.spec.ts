import { describe, expect, it } from 'vitest';

import { Prisma } from '@prisma/client';
import { ENTITIES, SYNC_ENTITIES, schemaDdl } from '@taskora/engine';

/**
 * 契约测试：Engine SQL schema ↔ Prisma schema（ADR-0007 明确要求）。
 *
 * Engine 拥有自己的 SQL schema（不从 Prisma 生成），两端靠本测试对齐：
 * 实体注册表的每个 wire 字段必须在 Prisma 模型上有同名、类型兼容的列
 * （或文档化的关系物化，如 tagIds）。漂移在 CI 就被抓住。
 */

const PRISMA_MODEL_NAMES: Record<string, string> = {
  task: 'Task',
  subtask: 'Subtask',
  project: 'Project',
  'project-heading': 'ProjectHeading',
  area: 'Area',
  tag: 'Tag',
  'tag-group': 'TagGroup',
};

type PrismaMapping =
  | { kind: 'column' | 'enum' | 'relation'; type?: string; relation?: string };

const TAG_RELATIONS: Partial<Record<string, { kind: 'relation'; relation: string }>> = {
  tagIds: { kind: 'relation', relation: 'TaskTag' },
};

function prismaModels(): Map<string, Map<string, { type: string; kind: string }>> {
  const models = new Map<string, Map<string, { type: string; kind: string }>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const fields = new Map<string, { type: string; kind: string }>();
    for (const field of model.fields) {
      fields.set(field.name, { type: field.type, kind: field.kind });
    }
    models.set(model.name, fields);
  }
  return models;
}

describe('Engine SQL schema ↔ Prisma schema 契约', () => {
  const models = prismaModels();

  it('七个同步实体都有对应的 Prisma 模型', () => {
    for (const entity of SYNC_ENTITIES) {
      const modelName = PRISMA_MODEL_NAMES[entity];
      expect(models.has(modelName), `${entity} → ${modelName}`).toBe(true);
    }
  });

  it('注册表每个 wire 字段在 Prisma 模型上有同名、类型兼容的列（或关系物化）', () => {
    const typeCompatible = (sqlType: string, prisma: PrismaMapping): boolean => {
      if (prisma.kind === 'relation') return true; // 关系物化，类型由关系表保证
      if (prisma.kind === 'enum') return sqlType === 'TEXT'; // 枚举 wire 上就是字符串
      switch (sqlType) {
        case 'TEXT':
          return ['String', 'DateTime', 'Json'].includes(prisma.type);
        case 'INTEGER':
          return ['Int', 'Float', 'Json'].includes(prisma.type);
        default:
          return false;
      }
    };

    for (const entity of SYNC_ENTITIES) {
      const def = ENTITIES[entity];
      const model = models.get(PRISMA_MODEL_NAMES[entity])!;
      for (const field of def.fields) {
        let mapping: PrismaMapping | undefined = TAG_RELATIONS[field.name];
        if (!mapping) {
          const column = model.get(field.name);
          if (column) {
            mapping = { kind: column.kind === 'enum' ? 'enum' : 'column', type: column.type };
          }
        }
        expect(mapping, `${entity}.${field.name} 应存在于 Prisma 模型 ${PRISMA_MODEL_NAMES[entity]}`).toBeDefined();
        if (mapping) {
          expect(
            typeCompatible(field.sql, mapping),
            `${entity}.${field.name}（${field.sql}）与 Prisma ${mapping.kind === 'column' ? mapping.type : mapping.relation} 类型不兼容`,
          ).toBe(true);
        }
      }
    }
  });

  it('同步实体行都有 fieldClocks / fieldDigests 列，排序实体有 position 列', () => {
    for (const entity of SYNC_ENTITIES) {
      const model = models.get(PRISMA_MODEL_NAMES[entity])!;
      expect(model.has('fieldClocks'), `${entity}.fieldClocks`).toBe(true);
      expect(model.has('fieldDigests'), `${entity}.fieldDigests`).toBe(true);
      if (ENTITIES[entity].orderField === 'position') {
        expect(model.has('position'), `${entity}.position`).toBe(true);
      }
    }
  });

  it('Engine 建表 DDL 覆盖注册表全部字段（含 id 与 clocks）', () => {
    for (const entity of SYNC_ENTITIES) {
      const def = ENTITIES[entity];
      const ddl = schemaDdl().find((statement) => statement.includes(`CREATE TABLE IF NOT EXISTS ${def.table}`));
      expect(ddl, `${def.table} 的 DDL`).toBeDefined();
      for (const field of ['id', ...def.fields.map((f) => f.name), 'clocks']) {
        expect(dddColumn(ddl!, field), `${def.table}.${field} 应出现在 DDL`).toBe(true);
      }
    }
  });
});

function dddColumn(ddl: string, column: string): boolean {
  return new RegExp(`(^|[(,]\\s*)${column}\\s`).test(ddl.replace(/\s+/g, ' '));
}
