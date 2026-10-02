export class ChatRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public retryAfterSeconds = 0
  ) {
    super(message);
  }
}

// Keep the request ID when the browser cannot tell whether a turn completed.
// A server-confirmed provider failure has no saved reply, so the next manual
// send may use a fresh ID.
export function shouldDiscardPendingRequest(error: ChatRequestError): boolean {
  if (error.status === 429) return true;
  if (
    error.code === 'previous_failed' ||
    error.code === 'previous_uncertain' ||
    error.code === 'provider_unavailable' ||
    error.code === 'invalid_response'
  ) return true;
  return error.status < 500 &&
    error.code !== 'processing' &&
    error.code !== 'conversation_busy';
}

export async function parseChatResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    const header = response.headers.get('Retry-After');
    const delay = header
      ? /^\d+$/.test(header)
        ? Number(header)
        : (Date.parse(header) - Date.now()) / 1000
      : Number(body.retryAfterSeconds);
    const seconds =
      Number.isFinite(delay) && delay > 0
        ? Math.ceil(delay)
        : response.status === 429 &&
            body.code !== 'message_cap' &&
            body.code !== 'token_cap'
          ? 60
          : 0;
    throw new ChatRequestError(
      body.error ?? 'Unable to complete the request',
      response.status,
      body.code,
      seconds
    );
  }
  return body as T;
}
