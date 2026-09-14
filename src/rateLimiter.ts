import { Env } from './types';
import { CONFIG } from './config';

interface RateLimitInfo {
  count: number;
  timestamp: number;
}

/**
 * A deploy misconfiguration the worker cannot recover from at request time.
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class RateLimiter {

  /**
   * Checks if a request is allowed based on the rate limit.
   * @param {Request} request - The incoming request.
   * @param {Env} env - The environment variables.
   * @returns {Promise<boolean>} Whether the request is allowed.
   * @throws {ConfigurationError} If rate limiting is enabled without a KV binding.
   */
  static async allowRequest(request: Request, env: Env): Promise<boolean> {
    const store = env.KV_STORE;
    if (!store) {
      throw new ConfigurationError('RATELIMIT_ENABLED is true but no KV_STORE binding is configured');
    }

    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) {
      console.warn('Unable to determine client IP address');
      return true; // Allow the request if we can't determine the IP
    }

    const key = `ratelimit:${env.CACHE_KEY_PREFIX}:${ip}`;
    const now = Date.now();

    let info: RateLimitInfo | null = await store.get(key, 'json');
    if (!info || now - info.timestamp > CONFIG.RATE_LIMIT_WINDOW) {
      info = { count: 1, timestamp: now };
    } else {
      info.count++;
    }

    if (info.count > CONFIG.MAX_REQUESTS_PER_WINDOW) {
      return false;
    }

    await store.put(key, JSON.stringify(info), { expirationTtl: CONFIG.RATE_LIMIT_WINDOW / 1000 });
    return true;
  }
}
