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
 * Presets for [OI]-compatible endpoints. `custom` has no defaults — the user
 * fills all three fields manually.
 */
export const AGENT_PROVIDER_PRESETS: AgentProviderPreset[] = [
  {
    id: 'openai',
    label: '[OI]',
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

/** GET /agent/config response. The API key is never returned in full. */
export interface AgentConfigResponseDto {
  /** True when baseUrl + apiKey + modelId are all usable. */
  configured: boolean;
  provider: string;
  baseUrl: string | null;
  modelId: string | null;
  /** Masked key like `••••ab12`; null when no key is stored. */
  apiKeyMasked: string | null;
}

export interface UpdateAgentConfigDto {
  /** Provider preset id; used only as a UI hint, stored as-is. */
  provider?: string;
  baseUrl?: string;
  /** Write-only: stored encrypted (AES-256-GCM). Never returned. */
  apiKey?: string;
  modelId?: string;
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
  | { type: 'approval_request'; approval: AgentApprovalDto }
  | { type: 'approval_resolved'; approval: AgentApprovalDto }
  | { type: 'conversation_updated'; conversation: ConversationDto }
  | { type: 'error'; message: string };
