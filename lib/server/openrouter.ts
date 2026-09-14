import 'server-only';

import { HttpError } from '@/lib/server/errors';

const OPENROUTER_ENDPOINT =
  'https://openrouter.ai/api/v1/chat/completions';

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenRouterResult = {
  reply: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
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

  if (model !== 'openrouter/free') {
    throw new Error(
      'Only openrouter/free is allowed during free testing'
    );
  }

  return {
    apiKey,
    model,
  };
}

export async function generateAdvisorReply(
  messages: OpenRouterMessage[]
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
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    console.error(
      'OpenRouter connection failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    throw new HttpError(
      502,
      'The advisor service is temporarily unavailable'
    );
  }

  if (!response.ok) {
    console.error(
      `OpenRouter returned status ${response.status}`
    );

    if (response.status === 429) {
      throw new HttpError(
        429,
        'The free advisor service is busy. Please try again shortly'
      );
    }

    throw new HttpError(
      502,
      'The advisor service is temporarily unavailable'
    );
  }

  const result = (await response.json()) as OpenRouterResponse;
  const reply = result.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    throw new HttpError(
      502,
      'The advisor did not return a usable response'
    );
  }

  return {
    reply,
    model: result.model ?? model,
    usage: {
      promptTokens: result.usage?.prompt_tokens ?? 0,
      completionTokens: result.usage?.completion_tokens ?? 0,
      totalTokens: result.usage?.total_tokens ?? 0,
      costUsd:
        typeof result.usage?.cost === 'number'
          ? result.usage.cost
          : null,
    },
  };
}