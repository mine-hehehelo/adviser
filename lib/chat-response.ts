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
