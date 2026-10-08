import type { Model } from '@earendil-works/pi-ai';
import { AGENT_THINKING_LEVELS, instantDateKey } from '@taskora/shared';
import type { ResolvedAgentConfig } from '../byok/agent-config.service';
import { normalizeBaseUrl } from '../byok/agent-config.service';

/**
 * Build a custom `Model<'openai-completions'>` that talks to an
 * OpenAI-compatible endpoint configured by the user (BYOK). The provider id is
 * a synthetic string — pi-ai treats unknown providers generically as long as
 * `baseUrl` and `api: 'openai-completions'` are set.
 *
 * `reasoning` is advertised as supported so users can point the config at a
 * reasoning model (deepseek-reasoner, qwen3, …) and get thinking output;
 * non-reasoning endpoints simply ignore the effort parameter.
 */
export function buildByokModel(config: ResolvedAgentConfig): Model<'openai-completions'> {
  return {
    id: config.modelId,
    name: config.modelId,
    api: 'openai-completions',
    provider: 'taskora-byok',
    baseUrl: normalizeBaseUrl(config.baseUrl),
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
  };
}

/** System prompt for the Assistant (identity + language following). */
export const AGENT_SYSTEM_PROMPT = `You are the Assistant inside Taskora, a personal task manager in the style of Things. You help the user organize and manage their tasks, projects, areas, tags and schedule through tools.

Guidelines:
- ALWAYS reply in the same language as the user's most recent message (e.g. Chinese messages get Chinese replies, English gets English).
- Be concise and friendly. Prefer short answers over walls of text.
- Use the product's Chinese terms when replying in Chinese: Area = 区域, Upcoming = 计划, Someday = 某天, Anytime = 随时, Scheduled Date = 计划日期, Deadline = 截止日期, Trash = 废纸篓, Put Back = 放回, Empty Trash = 倾倒废纸篓, Account = 账号, Conversation = 对话, Project Heading = 项目分组标题, Group Header = 分组头. Completed and cancelled tasks together are 已了结; reserve 已完成 for completed tasks and 逾期 for deadlines, never scheduled dates.
- Use the provided tools to read or change the user's data instead of guessing. When the user asks about their tasks, query first, then summarize.
- Irreversible operations (permanently emptying the trash, deleting an area or a project heading) require the user's explicit approval; if the user declines, acknowledge politely and suggest alternatives. Deleting a task or project only moves it to the trash (restorable) and needs no approval.
- Dates are ISO strings (YYYY-MM-DD). "Today" means the actual current date: {currentDate}.
- When creating tasks, pick sensible defaults and mention what you did.
- Never invent ids: look them up with list/search tools first.`;

/** Fill the system prompt with the current date. */
export function renderSystemPrompt(now = new Date(), timeZone = 'UTC'): string {
  return AGENT_SYSTEM_PROMPT.replace(
    '{currentDate}',
    `${instantDateKey(now, timeZone)} (${timeZone})`,
  );
}

/**
 * Dev fallback config from env (AGENT_DEV_BASE_URL / AGENT_DEV_API_KEY /
 * AGENT_DEV_MODEL) so smoke tests can run before any user saved BYOK values.
 * Returns null when incomplete.
 */
export function resolveDevConfig(): ResolvedAgentConfig | null {
  const baseUrl = process.env.AGENT_DEV_BASE_URL?.trim();
  const apiKey = process.env.AGENT_DEV_API_KEY?.trim();
  const modelId = process.env.AGENT_DEV_MODEL?.trim();
  if (!baseUrl || !apiKey || !modelId) return null;
  return {
    baseUrl,
    apiKey,
    modelId,
    // Legacy `AGENT_DEV_THINKING=1` maps to medium; the env var otherwise
    // accepts a level name (off/low/medium/high/xhigh/max).
    thinkingLevel:
      process.env.AGENT_DEV_THINKING === '1'
        ? 'medium'
        : isThinkingLevel(process.env.AGENT_DEV_THINKING)
          ? (process.env.AGENT_DEV_THINKING as ResolvedAgentConfig['thinkingLevel'])
          : 'off',
  };
}

function isThinkingLevel(value: string | undefined): boolean {
  return (AGENT_THINKING_LEVELS as readonly string[]).includes(value ?? '');
}

/**
 * Derive a short conversation title from a completed exchange. Used as the
 * fallback when LLM title generation fails (issue 05).
 */
export function fallbackTitle(firstUserMessage: string): string {
  const normalized = firstUserMessage.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 50) return normalized || 'New conversation';
  return `${normalized.slice(0, 50)}…`;
}

/** System prompt for the one-shot title generator. */
export const TITLE_SYSTEM_PROMPT =
  'Generate a very short title (at most 6 words, no quotes, no trailing punctuation) summarizing the conversation below. Reply in the language of the conversation.';
