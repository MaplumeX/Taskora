import { formatHlc } from './hlc';
import { mergeEntityState, mergeFieldWrites } from './merger';

const stamp = (wallMs: number, counter: number, deviceId: string) =>
  formatHlc({ wallMs, counter, deviceId });

describe('mergeFieldWrites', () => {
  it('当前态为 null（新实体）时全部接受', () => {
    const outcome = mergeFieldWrites(null, {
      title: { value: '买牛奶', hlc: stamp(1000, 0, 'dev-a') },
      notes: { value: null, hlc: stamp(1000, 0, 'dev-a') },
    });
    expect(outcome.fields).toEqual({ title: '买牛奶', notes: null });
    expect(outcome.appliedFields).toEqual(['title', 'notes']);
  });

  it('字段独立裁决：不同字段的并发编辑都保留', () => {
    const current = {
      fields: { title: '旧标题', dueDate: null, notes: '旧备注' },
      clocks: {
        title: stamp(1000, 0, 'hub'),
        dueDate: stamp(1000, 0, 'hub'),
        notes: stamp(1000, 0, 'hub'),
      },
    };
    const outcome = mergeFieldWrites(current, {
      title: { value: '新标题', hlc: stamp(2000, 0, 'dev-a') }, // 更新 → 接受
      notes: { value: '更旧备注', hlc: stamp(500, 0, 'dev-b') }, // 陈旧 → 丢弃
    });
    expect(outcome.fields.title).toBe('新标题');
    expect(outcome.fields.notes).toBe('旧备注');
    expect(outcome.fields.dueDate).toBeNull();
    expect(outcome.appliedFields).toEqual(['title']);
  });

  it('同一字段真并发：HLC 新者胜', () => {
    const current = {
      fields: { title: '设备A的标题' },
      clocks: { title: stamp(2000, 0, 'dev-a') },
    };
    const outcome = mergeFieldWrites(current, {
      title: { value: '设备B的标题', hlc: stamp(3000, 0, 'dev-b') },
    });
    expect(outcome.fields.title).toBe('设备B的标题');
  });

  it('同一字段 HLC 并列时按设备 ID 决胜（字典序大者胜）', () => {
    // 设备 A 先写，后到达的设备 B 写拥有相同 wall/counter → device-b 胜
    const current = {
      fields: { title: 'A' },
      clocks: { title: stamp(2000, 5, 'dev-a') },
    };
    const outcome = mergeFieldWrites(current, {
      title: { value: 'B', hlc: stamp(2000, 5, 'dev-b') },
    });
    expect(outcome.fields.title).toBe('B');
    // 反向：设备 B 已持有，设备 A 的同刻写被丢弃
    const reverse = mergeFieldWrites(
      { fields: { title: 'B' }, clocks: { title: stamp(2000, 5, 'dev-b') } },
      { title: { value: 'A', hlc: stamp(2000, 5, 'dev-a') } },
    );
    expect(reverse.fields.title).toBe('B');
  });

  it('完全相同的时间戳（重放/回声）幂等：不产生任何变更', () => {
    const current = {
      fields: { title: '标题' },
      clocks: { title: stamp(2000, 0, 'dev-a') },
    };
    const outcome = mergeFieldWrites(current, {
      title: { value: '标题', hlc: stamp(2000, 0, 'dev-a') },
    });
    expect(outcome.appliedFields).toEqual([]);
    expect(outcome.clocks).toEqual(current.clocks);
  });

  it('合并后的时钟包含双方胜者的时间戳', () => {
    const current = {
      fields: { title: '旧' },
      clocks: { title: stamp(1000, 0, 'hub') },
    };
    const outcome = mergeFieldWrites(current, {
      title: { value: '新', hlc: stamp(3000, 2, 'dev-a') },
    });
    expect(outcome.clocks.title).toBe(stamp(3000, 2, 'dev-a'));
  });
});

describe('mergeEntityState', () => {
  it('远端完整实体与本地合并：新字段胜、旧字段败、新字段补入', () => {
    const local = {
      fields: { title: '本地标题', notes: '本地备注' },
      clocks: {
        title: stamp(2000, 0, 'dev-a'),
        notes: stamp(3000, 0, 'dev-a'),
      },
    };
    const remote = {
      fields: { title: '远端标题', notes: '远端备注', dueDate: '2026-01-01' },
      clocks: {
        title: stamp(1000, 0, 'dev-b'), // 更旧：本地保留
        notes: stamp(4000, 0, 'dev-b'), // 更新：远端胜
        dueDate: stamp(4000, 1, 'dev-b'), // 本地缺失：直接接受
      },
    };
    const outcome = mergeEntityState(local, remote);
    expect(outcome.fields).toEqual({
      title: '本地标题',
      notes: '远端备注',
      dueDate: '2026-01-01',
    });
    expect(outcome.appliedFields).toEqual(['notes', 'dueDate']);
  });

  it('本地态为 null（拉到未知实体）时整体接受', () => {
    const remote = {
      fields: { title: '新任务' },
      clocks: { title: stamp(100, 0, 'dev-b') },
    };
    const outcome = mergeEntityState(null, remote);
    expect(outcome.fields).toEqual({ title: '新任务' });
  });
});
