import { describe, expect, it } from 'vitest';

import {
  AGENT_SYSTEM_PROMPT,
  buildByokModel,
  fallbackTitle,
  renderSystemPrompt,
  resolveDevConfig,
} from '../../src/agent/runtime/agent-model';

describe('agent-model helpers', () => {
  it('buildByokModel creates a custom openai-completions model', () => {
    const model = buildByokModel({
      baseUrl: 'https://api.deepseek.com/v1/',
      apiKey: 'sk-x',
      modelId: 'deepseek-chat',
    });
    expect(model.api).toBe('openai-completions');
    expect(model.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(model.id).toBe('deepseek-chat');
    expect(model.input).toContain('text');
  });

  it('system prompt asks the assistant to follow the user language and includes the date', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('same language');
    const rendered = renderSystemPrompt(new Date('2026-09-15T12:00:00Z'));
    expect(rendered).toContain('2026-09-15');
    expect(rendered).not.toContain('{currentDate}');
  });

  it('fallbackTitle truncates long messages', () => {
    expect(fallbackTitle('帮助我整理一下这周的   任务')).toBe('帮助我整理一下这周的 任务');
    const long = 'a'.repeat(80);
    const title = fallbackTitle(long);
    expect(title.length).toBe(51);
    expect(title.endsWith('…')).toBe(true);
    expect(fallbackTitle('')).toBe('New conversation');
  });

  it('resolveDevConfig reads env fallback and strips empties', () => {
    const prev = { ...process.env };
    delete process.env.AGENT_DEV_BASE_URL;
    expect(resolveDevConfig()).toBeNull();
    process.env.AGENT_DEV_BASE_URL = 'http://localhost:1234/v1';
    process.env.AGENT_DEV_API_KEY = 'k';
    process.env.AGENT_DEV_MODEL = 'm';
    expect(resolveDevConfig()).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      apiKey: 'k',
      modelId: 'm',
    });
    Object.assign(process.env, prev);
  });
});
