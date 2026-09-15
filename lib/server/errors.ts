import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError || error instanceof SyntaxError) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  console.error(error);

  return Response.json({ error: 'Unexpected server error' }, { status: 500 });
}
