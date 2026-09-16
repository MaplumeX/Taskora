/**
 * Assistant / Agent BYOK configuration and conversation DTOs.
 *
 * Engineering name is `agent` / `Conversation`; user-visible copy uses
 * 「助手 / Assistant」 (see root CONTEXT.md).
 */

/** Provider presets offered on the settings page. */
export interface AgentProviderPreset {
  id: string;
  /** i18n-free display label (used as fallback when no translation exists). */
  label: string;
  baseUrl: string;
  suggestedModelId: string;
}

/**
 * Presets for OpenAI-compatible endpoints. `custom` has no defaults — the user
 * fills all three fields manually.
 */
export const AGENT_PROVIDER_PRESETS: AgentProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    suggestedModelId: 'gpt-4o-mini',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    suggestedModelId: 'deepseek-chat',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    suggestedModelId: 'openai/gpt-4o-mini',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    suggestedModelId: 'qwen2.5:7b',
  },
  { id: 'custom', label: 'Custom', baseUrl: '', suggestedModelId: '' },
];

/** Thinking effort levels the Assistant supports (UI + persisted config). */
export type AgentThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const AGENT_THINKING_LEVELS: readonly AgentThinkingLevel[] = [
  'off',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

/** GET /agent/config response. The API key is never returned in full. */
export interface AgentConfigResponseDto {
  /** True when baseUrl + apiKey + modelId are all usable. */
  configured: boolean;
  provider: string;
  baseUrl: string | null;
  modelId: string | null;
  /** Masked key like `••••ab12`; null when no key is stored. */
  apiKeyMasked: string | null;
  /** Current thinking effort requested from the model. */
  thinkingLevel: AgentThinkingLevel;
}

export interface UpdateAgentConfigDto {
  /** Provider preset id; used only as a UI hint, stored as-is. */
  provider?: string;
  baseUrl?: string;
  /** Write-only: stored encrypted (AES-256-GCM). Never returned. */
  apiKey?: string;
  modelId?: string;
  thinkingLevel?: AgentThinkingLevel;
}

/** GET /agent/config/models response: model ids discovered on the endpoint. */
export interface AgentModelsResponseDto {
  models: string[];
}

/** Connectivity test can probe the stored config or an unsaved draft. */
export interface TestAgentConfigDto {
  baseUrl?: string;
  apiKey?: string;
  modelId?: string;
}

export interface AgentConfigTestResultDto {
  ok: boolean;
  message: string;
  /** Model ids discovered on the endpoint (when listing succeeded). */
  models: string[];
}

export interface ConversationDto {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConversationDto {
  title?: string;
}

export interface RenameConversationDto {
  title: string;
}

export interface SendConversationMessageDto {
  content: string;
}

export type ApprovalDecision = 'approve' | 'reject';

export interface ResolveApprovalDto {
  decision: ApprovalDecision;
}

/**
 * A serialized pi-agent-core `AgentMessage`, stored as JSON in the database.
 * The discriminated union lives in pi-agent-core; this is the wire/persisted
 * shape shared with the frontend.
 */
export interface AgentMessageJson {
  role: 'user' | 'assistant' | 'toolResult' | (string & {});
  [key: string]: unknown;
}

export interface ConversationMessageDto {
  id: string;
  seq: number;
  message: AgentMessageJson;
  createdAt: string;
}

/** Destructive tool call awaiting user approval. */
export interface AgentApprovalDto {
  id: string;
  conversationId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  /** Entity id → human-readable title, resolved when the approval was created. */
  labels: Record<string, string>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  resolvedAt: string | null;
}

/** Server-sent events on /agent/conversations/:id/events. */
export type AgentSseEvent =
  | { type: 'message_start'; message: AgentMessageJson }
  | { type: 'message_update'; message: AgentMessageJson }
  | { type: 'message_end'; message: AgentMessageJson }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: unknown }
  | {
      type: 'tool_execution_end';
      toolCallId: string;
      toolName: string;
      isError: boolean;
    }
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  /** A mutating tool just changed the user's data; refetch domain caches. */
  | { type: 'data_changed'; toolName: string }
  | { type: 'approval_request'; approval: AgentApprovalDto }
  | { type: 'approval_resolved'; approval: AgentApprovalDto }
  | { type: 'conversation_updated'; conversation: ConversationDto }
  | { type: 'error'; message: string };
