import 'server-only';

export type UsageLimits = {
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  requestsPerMinute: number;
};

function readPositiveInteger(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

export function getUsageLimits(): UsageLimits {
  return {
    dailyMessageLimit: readPositiveInteger('ADVISOR_DAILY_MESSAGE_LIMIT', 20),
    dailyTokenLimit: readPositiveInteger('ADVISOR_DAILY_TOKEN_LIMIT', 50_000),
    requestsPerMinute: readPositiveInteger('ADVISOR_REQUESTS_PER_MINUTE', 5),
  };
}
