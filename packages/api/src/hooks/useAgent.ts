import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
import type { TestAgentConfigDto, UpdateAgentConfigDto } from '@taskora/shared';

export const agentKeys = {
  config: ['agent', 'config'] as const,
  conversations: ['agent', 'conversations'] as const,
  messages: (conversationId: string) =>
    ['agent', 'conversations', conversationId, 'messages'] as const,
  approvals: (conversationId: string) =>
    ['agent', 'conversations', conversationId, 'approvals'] as const,
};

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
      decision: 'approve' | 'reject';
    }) => resolveApproval(conversationId, approvalId, decision),
    onSuccess: (approval) => {
      void queryClient.setQueryData<import('@taskora/shared').AgentApprovalDto[]>(
        agentKeys.approvals(conversationId),
        (current) => (current ?? []).map((a) => (a.id === approval.id ? approval : a)),
      );
    },
  });
}
