import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import {
  createConversation,
  deleteConversation,
  getAgentConfig,
  listAgentModels,
  listConversationMessages,
  listConversations,
  listPendingApprovals,
  renameConversation,
  resolveApproval,
  sendConversationMessage,
  testAgentConfig,
  updateAgentConfig,
} from '@/api/agent.api';
import type {
  ApprovalDecision,
  ConversationDto,
  TestAgentConfigDto,
  UpdateAgentConfigDto,
} from '@taskora/shared';

import { useAssistantUiStore } from '@/stores/assistantUi.store';

import { areaKeys } from './useAreas';
import { feedKeys } from './useFeed';
import { projectHeadingKeys } from './useProjectHeadings';
import { projectKeys } from './useProjects';
import { tagKeys } from './useTags';
import { taskKeys } from './useTasks';

export const agentKeys = {
  config: ['agent', 'config'] as const,
  models: ['agent', 'config', 'models'] as const,
  conversations: ['agent', 'conversations'] as const,
  messages: (conversationId: string) =>
    ['agent', 'conversations', conversationId, 'messages'] as const,
  approvals: (conversationId: string) =>
    ['agent', 'conversations', conversationId, 'approvals'] as const,
};

/**
 * Domain query families a mutating Assistant tool can dirty. Lists use the
 * plural key objects, detail queries the singular prefixes (`['project', id]`,
 * …). The agent writes through backend services directly, bypassing every
 * REST mutation hook, so these caches only stay fresh via explicit
 * invalidation.
 */
const domainQueryKeys: readonly (readonly unknown[])[] = [
  areaKeys.all,
  ['area'],
  projectKeys.all,
  ['project'],
  taskKeys.all,
  ['task'],
  tagKeys.all,
  ['tag'],
  projectHeadingKeys.all,
  feedKeys.all,
];

/**
 * Invalidate all domain caches after the Assistant changed data (SSE
 * `data_changed`). Refetches what is mounted; the rest is marked stale for
 * the next mount.
 */
export function invalidateDomainData(queryClient: QueryClient): void {
  for (const queryKey of domainQueryKeys) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}

// ------------------------------------------------------------------- config

export function useAgentConfig() {
  return useQuery({ queryKey: agentKeys.config, queryFn: getAgentConfig });
}

export function useUpdateAgentConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateAgentConfigDto) => updateAgentConfig(data),
    onSuccess: (config) => {
      void queryClient.setQueryData(agentKeys.config, config);
    },
  });
}

export function useTestAgentConfig() {
  return useMutation({
    mutationFn: (data: TestAgentConfigDto) => testAgentConfig(data),
  });
}

/** Model ids available on the configured endpoint (composer picker). */
export function useAgentModels(enabled: boolean) {
  return useQuery({
    queryKey: agentKeys.models,
    queryFn: listAgentModels,
    enabled,
    staleTime: 5 * 60_000,
  });
}

// ------------------------------------------------------------ conversations

export function useConversations() {
  return useQuery({
    queryKey: agentKeys.conversations,
    queryFn: listConversations,
  });
}

/**
 * The Conversation shown by both Assistant views (panel and `/agent`): the
 * stored choice while it is still in the list, else the most recent one
 * (list is updatedAt-desc). Derived, so a deleted choice falls back without
 * an effect and both views always agree.
 */
export function useActiveConversation() {
  const query = useConversations();
  const conversations = query.data ?? [];
  const storedId = useAssistantUiStore((s) => s.activeConversationId);
  const setActiveId = useAssistantUiStore((s) => s.setActiveConversationId);
  const active = conversations.find((c) => c.id === storedId) ?? conversations[0] ?? null;
  return {
    conversations,
    isLoading: query.isLoading,
    active,
    activeId: active?.id ?? null,
    setActiveId,
  };
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => createConversation(title),
    onSuccess: (conversation) => {
      // Optimistically prepend before invalidating: callers switch to the new
      // conversation on success, and useActiveConversation would otherwise
      // not find it in the stale list (refetch still in flight) and keep
      // showing the previous conversation.
      queryClient.setQueryData<ConversationDto[]>(
        agentKeys.conversations,
        (current) => [conversation, ...(current ?? [])],
      );
      void queryClient.invalidateQueries({ queryKey: agentKeys.conversations });
      return conversation;
    },
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameConversation(id, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.conversations });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.conversations });
    },
  });
}

export function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: agentKeys.messages(conversationId ?? 'none'),
    queryFn: () => listConversationMessages(conversationId!),
    enabled: Boolean(conversationId),
  });
}

export function useSendConversationMessage(conversationId: string | null) {
  return useMutation({
    mutationFn: (content: string) => sendConversationMessage(conversationId!, content),
    // No cache write: the reply arrives over SSE and message_end events are
    // reconciled into the query cache by the SSE provider.
  });
}

// ---------------------------------------------------------------- approvals

export function usePendingApprovals(conversationId: string | null) {
  return useQuery({
    queryKey: agentKeys.approvals(conversationId ?? 'none'),
    queryFn: () => listPendingApprovals(conversationId!),
    enabled: Boolean(conversationId),
  });
}

export function useResolveApproval(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      approvalId,
      decision,
    }: {
      approvalId: string;
      decision: ApprovalDecision;
    }) => resolveApproval(conversationId, approvalId, decision),
    onSuccess: (approval) => {
      void queryClient.setQueryData<import('@taskora/shared').AgentApprovalDto[]>(
        agentKeys.approvals(conversationId),
        (current) => (current ?? []).map((a) => (a.id === approval.id ? approval : a)),
      );
    },
  });
}
