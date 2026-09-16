import 'server-only';
import { HttpError } from '@/lib/server/errors';

import { recordEvent, type EventContext } from './events';
import { MAX_COMPLETION_TOKENS } from './token-budget';


const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenRouterResult = {
  reply: string;
  model: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    costUsd: number | null;
  };
};

type OpenRouterResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
};

function getOpenRouterConfiguration() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_MODEL?.trim();

  if (!apiKey) {
    throw new Error('OpenRouter API key is missing');
  }

  if (!model || (model !== 'openrouter/free' && !model.endsWith(':free'))) {
    throw new Error('Only free OpenRouter models are allowed during testing');
  }

  return {
    apiKey,
    model,
  };
}

function readNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function readNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function readUsage(result: OpenRouterResponse): OpenRouterResult['usage'] {
  const promptTokens = readNonNegativeInteger(result.usage?.prompt_tokens);

  const completionTokens = readNonNegativeInteger(
    result.usage?.completion_tokens
  );

  const reportedTotal = readNonNegativeInteger(result.usage?.total_tokens);

  return {
    promptTokens,
    completionTokens,
    totalTokens:
      reportedTotal ??
      (promptTokens !== null && completionTokens !== null
        ? promptTokens + completionTokens
        : null),
    costUsd: readNonNegativeNumber(result.usage?.cost),
  };
}

export async function generateAdvisorReply(
  messages: OpenRouterMessage[],
  context?: EventContext
): Promise<OpenRouterResult> {
  const { apiKey, model } = getOpenRouterConfiguration();

  let response: Response;

  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Advisor Console',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: MAX_COMPLETION_TOKENS,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    await recordEvent('provider_error', context, { kind: 'connection' });
    console.error(
      'OpenRouter connection failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    throw new HttpError(502, 'The advisor service is temporarily unavailable');
  }

  if (!response.ok) {
    await recordEvent('provider_error', context, {
      kind: 'http',
      status: response.status,
    });
    console.error(`OpenRouter returned status ${response.status}`);

    if (response.status === 429) {
      throw new HttpError(
        429,
        'The free advisor service is busy. Please try again shortly',
        'provider_busy',
        60
      );
    }

    throw new HttpError(502, 'The advisor service is temporarily unavailable');
  }

  let result: OpenRouterResponse;
  try {
    result = await response.json();
  } catch {
    await recordEvent('provider_error', context, { kind: 'invalid_response' });
    throw new HttpError(502, 'The advisor did not return a usable response');
  }

  const reply = result.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    await recordEvent('provider_error', context, { kind: 'invalid_response' });
    throw new HttpError(502, 'The advisor did not return a usable response');
  }

  return {
    reply,
    model: result.model ?? model,
    usage: readUsage(result),
  };
}
