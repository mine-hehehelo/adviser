import type { OpenRouterMessage } from './openrouter';

export const MAX_COMPLETION_TOKENS = 500;

// Conservative admission estimate for the variable free-model router. This is
// not a provider tokenizer: actual usage remains authoritative on completion.
export function estimateTokenBudget(messages: OpenRouterMessage[]): number {
  return (
    4096 +
    MAX_COMPLETION_TOKENS +
    messages.reduce(
      (total, message) =>
        total + Buffer.byteLength(message.content, 'utf8') + 64,
      0
    )
  );
}
