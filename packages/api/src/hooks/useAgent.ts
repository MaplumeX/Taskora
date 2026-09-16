import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import {
  createConversation,
  deleteConversation,
  getAgentConfig,
  listConversationMessages,
  listConversations,
  listPendingApprovals,
  renameConversation,
  resolveApproval,
  sendConversationMessage,
  testAgentConfig,
  updateAgentConfig,
} from '@/api/agent.api';
import type { ApprovalDecision, TestAgentConfigDto, UpdateAgentConfigDto } from '@taskora/shared';

import { areaKeys } from './useAreas';
import { feedKeys } from './useFeed';
import { projectHeadingKeys } from './useProjectHeadings';
import { projectKeys } from './useProjects';
import { tagGroupKeys } from './useTagGroups';
import { tagKeys } from './useTags';
import { taskKeys } from './useTasks';

export const agentKeys = {
  config: ['agent', 'config'] as const,
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
  tagGroupKeys.all,
  ['tag-group'],
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

// ------------------------------------------------------------ conversations

export function useConversations() {
  return useQuery({
    queryKey: agentKeys.conversations,
    queryFn: listConversations,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => createConversation(title),
    onSuccess: (conversation) => {
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
