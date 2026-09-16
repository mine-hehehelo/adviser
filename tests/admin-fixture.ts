import type { AdminHistory, AdminSettings, AdminUsage } from '../lib/admin-types';

const stamp = '2026-09-15T06:10:00Z';
const person = { userId: 'test-person', displayName: 'Demo Learner', email: 'learner@example.test' };
export const usage: AdminUsage = {
  day: '2026-09-15', generatedAt: stamp,
  totals: { users: 1, messages: 8, tokens: 6420, estimatedCostUsd: 0.0128 },
  users: [{ ...person, messagesToday: 8, tokensToday: 6420, estimatedCostUsd: 0.0128 }],
  recentConversations: [{ ...person, id: 'test-conversation', title: 'Planning a manageable project week', createdAt: stamp, updatedAt: stamp }],
  recentTurns: ['completed', 'blocked', 'failed', 'processing'].map((status, index) => ({
    ...person, id: `test-turn-${index}`, conversationId: 'test-conversation', requestId: `test-request-${index}`, status,
    blockReason: status === 'blocked' ? 'message_cap' : null, errorCode: status === 'failed' ? 'http_502' : null,
    model: status === 'completed' ? 'openrouter/free' : null, documentSource: status === 'completed' ? 'cache' : null,
    promptTokens: status === 'completed' ? 500 : null, completionTokens: status === 'completed' ? 120 : null,
    totalTokens: status === 'completed' ? 620 : null, estimatedCostUsd: status === 'completed' ? 0.0012 : null,
    userInput: ['How can I prioritize my project work this week?', 'Help me plan another study session.', 'Can we review the next milestone?', 'Where should I focus my attention?'][index],
    assistantResponse: status === 'completed' ? 'Start with the nearest deadline. Choose one achievable milestone for today, and reserve time to review what you learned.' : null,
    createdAt: stamp, completedAt: status === 'processing' ? null : stamp,
  })),
};
export const settings: AdminSettings = { limits: { dailyMessageLimit: 20, dailyTokenLimit: 50000, requestsPerMinute: 5 }, model: 'openrouter/free', cacheTtlSeconds: 300, promptUrl: null, referenceUrl: null };
export const history: AdminHistory = { conversation: { id: 'test-conversation', title: 'Planning a manageable project week' }, messages: [{ id: 'm1', role: 'user', content: usage.recentTurns[0].userInput, sequence: 1, created_at: stamp }, { id: 'm2', role: 'assistant', content: usage.recentTurns[0].assistantResponse!, sequence: 2, created_at: stamp }], nextOffset: null };
