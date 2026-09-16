import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public retryAfterSeconds?: number
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
      },
      {
        status: error.status,
        headers: error.retryAfterSeconds
          ? { 'Retry-After': String(error.retryAfterSeconds) }
          : undefined,
      }
    );
  }

  if (error instanceof ZodError || error instanceof SyntaxError) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  console.error(error);

  return Response.json({ error: 'Unexpected server error' }, { status: 500 });
}
