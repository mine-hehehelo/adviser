export type AdminPerson = {
  userId: string;
  email: string | null;
  displayName: string | null;
};
export type AdminTurn = AdminPerson & {
  id: string;
  conversationId: string | null;
  requestId: string;
  status: string;
  blockReason: string | null;
  errorCode: string | null;
  model: string | null;
  documentSource: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  userInput: string;
  assistantResponse: string | null;
  createdAt: string;
  completedAt: string | null;
};
export type AdminUsage = {
  day: string;
  generatedAt: string;
  totals: {
    users: number;
    messages: number;
    tokens: number;
    estimatedCostUsd: number;
  };
  users: (AdminPerson & {
    messagesToday: number;
    tokensToday: number;
    estimatedCostUsd: number;
  })[];
  recentConversations: (AdminPerson & {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  })[];
  recentTurns: AdminTurn[];
};
export type AdminSettings = {
  limits: {
    dailyMessageLimit: number;
    dailyTokenLimit: number;
    requestsPerMinute: number;
  };
  model: string | null;
  cacheTtlSeconds: number;
  promptUrl: string | null;
  referenceUrl: string | null;
};
export type AdminHistory = {
  conversation: { id: string; title: string };
  messages: {
    id: string;
    role: string;
    content: string;
    sequence: number;
    created_at: string;
  }[];
  nextOffset: number | null;
};
