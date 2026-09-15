import { apiClient } from './client';
import type {
  AgentConfigResponseDto,
  AgentConfigTestResultDto,
  AgentApprovalDto,
  ConversationDto,
  ConversationMessageDto,
  TestAgentConfigDto,
  UpdateAgentConfigDto,
} from '@taskora/shared';

// ------------------------------------------------------------------- config

export function getAgentConfig(): Promise<AgentConfigResponseDto> {
  return apiClient.get<AgentConfigResponseDto>('/agent/config').then((r) => r.data);
}

export function updateAgentConfig(data: UpdateAgentConfigDto): Promise<AgentConfigResponseDto> {
  return apiClient.put<AgentConfigResponseDto>('/agent/config', data).then((r) => r.data);
}

export function testAgentConfig(data: TestAgentConfigDto): Promise<AgentConfigTestResultDto> {
  return apiClient.post<AgentConfigTestResultDto>('/agent/config/test', data).then((r) => r.data);
}

// ------------------------------------------------------------ conversations

export function listConversations(): Promise<ConversationDto[]> {
  return apiClient.get<ConversationDto[]>('/agent/conversations').then((r) => r.data);
}

export function createConversation(title?: string): Promise<ConversationDto> {
  return apiClient
    .post<ConversationDto>('/agent/conversations', title ? { title } : {})
    .then((r) => r.data);
}

export function renameConversation(id: string, title: string): Promise<ConversationDto> {
  return apiClient
    .patch<ConversationDto>(`/agent/conversations/${id}`, { title })
    .then((r) => r.data);
}

export function deleteConversation(id: string): Promise<{ ok: boolean }> {
  return apiClient.delete<{ ok: boolean }>(`/agent/conversations/${id}`).then((r) => r.data);
}

export function listConversationMessages(id: string): Promise<ConversationMessageDto[]> {
  return apiClient
    .get<ConversationMessageDto[]>(`/agent/conversations/${id}/messages`)
    .then((r) => r.data);
}

export function sendConversationMessage(id: string, content: string): Promise<{ ok: boolean }> {
  return apiClient
    .post<{ ok: boolean }>(`/agent/conversations/${id}/messages`, { content })
    .then((r) => r.data);
}

// ---------------------------------------------------------------- approvals

export function listPendingApprovals(conversationId: string): Promise<AgentApprovalDto[]> {
  return apiClient
    .get<AgentApprovalDto[]>(`/agent/conversations/${conversationId}/approvals`)
    .then((r) => r.data);
}

export function resolveApproval(
  conversationId: string,
  approvalId: string,
  decision: 'approve' | 'reject',
): Promise<AgentApprovalDto> {
  return apiClient
    .post<AgentApprovalDto>(`/agent/conversations/${conversationId}/approvals/${approvalId}`, {
      decision,
    })
    .then((r) => r.data);
}
