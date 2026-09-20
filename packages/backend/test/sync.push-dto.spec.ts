import { ValidationPipe, BadRequestException } from '@nestjs/common';

import { PushRequestDto } from '../src/sync/dto/sync.dto';

/**
 * 回归测试（v0.4.1「桌面端永久离线」事故）：全局 ValidationPipe 开了
 * whitelist + forbidNonWhitelisted。曾经 fields 误标 @IsArray()（fields
 * 实为 Record）且嵌套数组缺 @Type，导致一切合法 push 都被 400 拒绝——
 * 桌面端 Outbox 推不出去，永远显示离线。此处在真实 pipe 配置下直接
 * 验证 DTO 与协议载荷（{@taskora/engine} WireRow 字段写）兼容。
 */
describe('sync PushRequestDto under the global ValidationPipe', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  /** engine 实际发送的载荷形状：fields 是 Record，value 可为 null。 */
  const validBody = {
    deviceId: 'device-1',
    events: [
      {
        entity: 'task',
        id: 'task-1',
        fields: {
          title: { value: '买牛奶', hlc: '1:0:device-1' },
          notes: { value: null, hlc: '2:0:device-1' },
          position: { value: 'a1', hlc: '3:0:device-1' },
        },
      },
    ],
    deletes: [{ entity: 'tag', ids: ['tag-9'] }],
  };

  it('accepts a real engine push payload and preserves field values', async () => {
    const dto = await pipe.transform(validBody as never, {
      type: 'body',
      metatype: PushRequestDto,
    });
    expect(dto.events).toHaveLength(1);
    const event = dto.events[0];
    expect(event.entity).toBe('task');
    expect(event.fields.title.value).toBe('买牛奶');
    expect(event.fields.notes.value).toBeNull();
    expect(event.fields.position.hlc).toBe('3:0:device-1');
    expect(dto.deletes?.[0]).toEqual({ entity: 'tag', ids: ['tag-9'] });
  });

  it('accepts a payload without deletes (optional)', async () => {
    const { deletes: _deletes, ...withoutDeletes } = validBody;
    const dto = await pipe.transform(withoutDeletes as never, {
      type: 'body',
      metatype: PushRequestDto,
    });
    expect(dto.deletes).toBeUndefined();
    expect(dto.events).toHaveLength(1);
  });

  it('still rejects unknown entities and unknown properties', async () => {
    await expect(
      pipe.transform(
        { ...validBody, events: [{ entity: 'bogus', id: 'x', fields: {} }] } as never,
        { type: 'body', metatype: PushRequestDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      pipe.transform({ ...validBody, hacker: true } as never, {
        type: 'body',
        metatype: PushRequestDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
