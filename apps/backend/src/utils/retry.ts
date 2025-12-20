/**
 * Retry Utility with Exponential Backoff
 * Used for resilient API calls and external service communication
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[]; // Error messages that should trigger retry
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'rate limit',
    'timeout',
    '429',
    '500',
    '502',
    '503',
    '504',
  ],
};

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable based on config
 */
function isRetryableError(error: Error, config: RetryConfig): boolean {
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();

  // Check against retryable error patterns
  for (const pattern of config.retryableErrors || []) {
    if (
      errorMessage.includes(pattern.toLowerCase()) ||
      errorName.includes(pattern.toLowerCase())
    ) {
      return true;
    }
  }

  // Check for common network errors
  if ('code' in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(code)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay for next retry attempt with jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter (±20%) to prevent thundering herd
  const jitter = cappedDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Execute an operation with retry logic
 *
 * @param operation - Async function to execute
 * @param context - Description for logging
 * @param config - Retry configuration (optional, uses defaults)
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error = new Error('No attempts made');

  for (let attempt = 1; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isLastAttempt = attempt >= finalConfig.maxRetries;
      const shouldRetry = !isLastAttempt && isRetryableError(lastError, finalConfig);

      if (!shouldRetry) {
        console.error(`[${context}] Failed (non-retryable): ${lastError.message}`);
        throw lastError;
      }

      const delay = calculateDelay(attempt, finalConfig);
      console.warn(
        `[${context}] Attempt ${attempt}/${finalConfig.maxRetries} failed: ${lastError.message}. ` +
          `Retrying in ${delay}ms...`
      );

      if (finalConfig.onRetry) {
        finalConfig.onRetry(attempt, lastError, delay);
      }

      await sleep(delay);
    }
  }

  throw new Error(
    `[${context}] All ${finalConfig.maxRetries} attempts failed. Last error: ${lastError.message}`
  );
}

/**
 * Retry decorator for class methods
 */
export function Retryable(context: string, config: Partial<RetryConfig> = {}) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return withRetry(() => originalMethod.apply(this, args), context, config);
    };

    return descriptor;
  };
}

/**
 * Create a retryable version of a function
 */
export function makeRetryable<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context: string,
  config: Partial<RetryConfig> = {}
): T {
  return (async (...args: Parameters<T>) => {
    return withRetry(() => fn(...args), context, config);
  }) as T;
}
