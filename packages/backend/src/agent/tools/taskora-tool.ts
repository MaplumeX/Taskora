import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { Static, TSchema } from 'typebox';

/**
 * AgentTool extension marking irreversible operations. The approval
 * interceptor (issue 04) blocks these until the user approves them via the
 * UI. Only truly irreversible tools (hard delete, empty trash) should carry
 * this flag — gating reversible writes would dilute the approval signal.
 */
export interface TaskoraAgentTool<
  TParameters extends TSchema = TSchema,
> extends AgentTool<TParameters> {
  /** True when this tool is irreversible and requires explicit user approval. */
  destructive?: boolean;
}

/**
 * Identity helper with schema-driven inference: `parameters` infers `P`, so
 * the `execute` callback's params argument is typed as `Static<P>`.
 */
export function defineTool<P extends TSchema>(tool: TaskoraAgentTool<P>): TaskoraAgentTool<P> {
  return tool;
}

/** Drop null/undefined fields so tool results stay compact for the LLM. */
export function compact<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/** Serialize a tool payload as plain text content for the LLM. */
export function textResult(details: unknown) {
  const text = typeof details === 'string' ? details : JSON.stringify(details, null, 2);
  return {
    content: [{ type: 'text' as const, text }],
    details,
  };
}

/** Shorten an entity list for tool output. */
export function summarizeList<T>(
  items: T[],
  limit: number,
  item: (value: T) => Record<string, unknown>,
): { count: number; truncated: boolean; items: Record<string, unknown>[] } {
  const shown = items.slice(0, limit);
  return {
    count: items.length,
    truncated: items.length > limit,
    items: shown.map(item),
  };
}

/** Re-exported for tool authors. */
export type { Static };
