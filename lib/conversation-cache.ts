export const conversationListKey = (userId: string) =>
  ['/api/conversations', userId] as const;

export const isConversationListKey = (key: unknown) =>
  Array.isArray(key) && key[0] === '/api/conversations';
