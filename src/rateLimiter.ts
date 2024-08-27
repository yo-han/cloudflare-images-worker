import { Env } from './types';
import { CONFIG } from './config';

interface RateLimitInfo {
  count: number;
  timestamp: number;
}

export class RateLimiter {

  /**
   * Checks if a request is allowed based on the rate limit.
   * @param {Request} request - The incoming request.
   * @param {Env} env - The environment variables.
   * @returns {Promise<boolean>} Whether the request is allowed.
   */
  static async allowRequest(request: Request, env: Env): Promise<boolean> {
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) {
      console.warn('Unable to determine client IP address');
      return true; // Allow the request if we can't determine the IP
    }

    const key = `ratelimit:${env.CACHE_KEY_PREFIX}:${ip}`;
    const now = Date.now();

    let info: RateLimitInfo | null = await env.KV_STORE.get(key, 'json');
    if (!info || now - info.timestamp > CONFIG.RATE_LIMIT_WINDOW) {
      info = { count: 1, timestamp: now };
    } else {
      info.count++;
    }

    if (info.count > CONFIG.MAX_REQUESTS_PER_WINDOW) {
      return false;
    }

    await env.KV_STORE.put(key, JSON.stringify(info), { expirationTtl: CONFIG.RATE_LIMIT_WINDOW / 1000 });
    return true;
  }
}